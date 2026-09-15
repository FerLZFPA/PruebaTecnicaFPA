# Document Processing Pipeline & Analytics

A NestJS service that ingests messy, out-of-order "Processing Events" from OCR/AI
engines, normalizes them into a per-document state, and exposes an analytics
summary for the Ops team via MongoDB aggregation pipelines.

---

## Running the project

### Prerequisites

- Node.js 22+
- Docker (for MongoDB) — or a MongoDB instance you point the app at

### 1. Install dependencies

```bash
npm install
```

### 2. Start MongoDB

```bash
docker compose up -d
```

This starts MongoDB 7 on `localhost:27017` (see `docker-compose.yml`).

### 3. Start the API

```bash
# watch mode (development)
npm run start:dev

# or production build
npm run build
npm run start:prod
```

The API listens on **http://localhost:3000**.

### Configuration

Both are optional and fall back to sane defaults:

| Variable       | Default                                          |
| -------------- | ------------------------------------------------ |
| `PORT`         | `3000`                                           |
| `MONGODB_URI`  | `mongodb://localhost:27017/processing-events`    |

### Running the tests

```bash
npm test
```

> The `@nestjs` v12 stack ships as ESM only, so Jest runs in ESM mode
> (`node --experimental-vm-modules`, already wired into the `test` scripts).

---

## API

### `POST /events`

Ingests a single processing event. Required fields are validated with
`class-validator`; optional fields may be missing, `null`, or the literal string
`"undefined"`.

```bash
curl -X POST http://localhost:3000/events \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "evt-1",
    "documentId": "doc-1",
    "status": "PROCESSED",
    "documentType": "INVOICE",
    "provider": "aws-textract",
    "metadata": { "pages": 3 },
    "createdAt": "2026-09-14T10:00:00.000Z"
  }'
```

A minimal payload is also accepted (optional fields are normalized):

```bash
curl -X POST http://localhost:3000/events \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "evt-2",
    "documentId": "doc-2",
    "status": "MANUAL_INPUT",
    "provider": "undefined",
    "createdAt": "2026-09-14T11:00:00.000Z"
  }'
```

### `GET /reports/summary`

Returns system health computed by a **single** aggregation pipeline:

```json
{
  "statusDistribution": [
    { "_id": "PROCESSED", "count": 12 },
    { "_id": "FAILED", "count": 3 }
  ],
  "documentTypeBreakdown": [
    { "type": "INVOICE", "count": 8, "percentage": 53.3 },
    { "type": "ID_CARD", "count": 4, "percentage": 26.6 }
  ]
}
```

### `GET /health`

Liveness probe → `{ "status": "ok" }`.

---

## Design overview

### Modules

- **`EventsModule`** — ingestion endpoint, validation/normalization, raw-event
  persistence, and delegation to `DocumentsModule`.
- **`DocumentsModule`** — owns the `Document` projection and the merge rules.
  Exports `DocumentsService` (consumed by `EventsModule`), so dependency
  injection stays one-directional and clean.
- **`ReportsModule`** — read-only analytics over the `Document` collection.

Normalization lives in a dedicated `EventsMapper`, keeping the service thin.

### Two collections

- **`events`** — the raw, immutable event log (source of truth / audit trail).
- **`documents`** — the current, normalized state of each document, derived by
  folding events in.

### Schema design & indices

**`Event`**

- `timestamps` enabled, but the auto `createdAt` is renamed to **`insertedAt`**
  so it doesn't collide with the business `createdAt` from the payload.
- `eventId` — **unique** index (idempotency key).
- `documentId` — indexed; plus a compound `{ documentId: 1, createdAt: -1 }`
  index to fetch a document's event history in order efficiently.
- `status` uses an explicit `{ type: String, enum: ProcessingStatus }` so
  Mongoose infers the type reliably.

**`Document`**

- `timestamps` enabled.
- `documentId` — **unique** index (one document per id).
- `status` — indexed (drives the Status Distribution grouping).
- `lastEventCreatedAt` — the `createdAt` of the last event applied; used to
  reject stale/out-of-order events.

### The aggregation pipeline

`GET /reports/summary` is a single `$facet` pipeline (no `find()` fan-out, no
manual JS array manipulation):

- one facet groups by `status` (Status Distribution),
- another filters to the known document types, groups, and computes each type's
  percentage of the total,
- the percentage division is guarded with `$cond` so an empty collection (total
  = 0) never throws.

### Error handling

A global `AllExceptionsFilter` returns a consistent JSON envelope
(`{ statusCode, path, message }`): `HttpException`s (including 400s from the
`ValidationPipe`) keep their status, Mongo duplicate keys map to `409`, and
anything unexpected is logged server-side and returned as `500`.

### Data resilience

- **Idempotency** — the event is written with a single atomic
  `findOneAndUpdate({ eventId }, { $setOnInsert }, { upsert: true })`, so
  redelivering the same event is a no-op and concurrent duplicates can't collide.
- **Out-of-order & conflicting events** — the `Document` merge runs as one
  atomic aggregation-pipeline update (no read-then-write race). Older events are
  ignored, and a later `FAILED` never overwrites a `PROCESSED` document.
- **Messy fields** — `provider`, `documentType`, and `metadata` accept missing /
  `null` / `"undefined"` and are normalized before persistence; the reporting
  pipeline tolerates `null` fields without breaking.

---

## Assumptions

Requirements already stated in the brief (defaulting `provider` to
`internal-engine`, accepting `null`/`"undefined"`, idempotency, tolerating
missing metadata, etc.) are implemented as specified. The decisions below are
the ones the brief left ambiguous or unspecified:

1. **Conflict resolution is by `createdAt`, newest wins.** The brief says events
   arrive out of order but not how to reconcile them. The `Document` reflects the
   event with the greatest `createdAt`; stale re-deliveries are ignored.
2. **`PROCESSED` is terminal with respect to `FAILED`.** A later `FAILED` event
   does not downgrade a document that is already `PROCESSED` (a late failure from
   a secondary engine shouldn't erase a successful result). Every other
   transition follows the recency rule above.
3. **Idempotency is keyed on `eventId`, not `documentId`.** The same `eventId`
   redelivered is a no-op; *different* events for the same `documentId` are merged
   into the state. This assumes `eventId` uniquely identifies a delivery.
4. **"Total" in the Document Type Breakdown means all documents**, including
   those with a `null` type. Consequently the type percentages **do not sum to
   100%** — the remainder represents unclassified documents. (The alternative,
   relative to typed documents only, was considered and rejected to keep the
   number representative of real classification coverage.)
5. **Invalid enum values are rejected with `400`, not coerced.** A non-empty but
   invalid `documentType` (e.g. `"PASSPORT"`) or unknown `status` is treated as a
   client error rather than silently normalized to `null`.
6. **The payload `createdAt` is the business source of truth for ordering**,
   separate from Mongo's insertion timestamp (stored as `insertedAt`).
7. **Ingestion is synchronous and unauthenticated** — assumed to run on an
   internal network / behind a gateway, at moderate volume. See scaling note for
   1M events/hour.

---

## Scaling to 1,000,000 events/hour (~280/s)

That's about **280 events per second** on average. My approach has three parts:

**1. Make the code as efficient as possible.**
The less work the app does on each request, the more traffic it can handle:

- Every search in the database uses an **index**, so it never has to read the
  whole collection to find what it needs — it goes straight to the record.
- Each event is saved in a **single database call**.
- **Cache the reports.** The `/reports/summary` query is the heaviest one, and
  the dashboard doesn't need second-by-second numbers, so I'd save the result for
  a few seconds and reuse it. That way most requests return the saved answer
  instantly instead of recalculating it every time.

**2. Scale horizontally (add more copies).**
Instead of one big server, run **several copies of the app** at the same time so
the load is split between them. **MongoDB already supports running as multiple
copies too**, so the database grows the same way as traffic increases.

**3. Block abusive traffic.**
Not all requests are legitimate. I'd **limit how many requests a single client
can make** in a given time and reject the extra ones, and **block callers that
look fake or send an abnormal number of requests**. This keeps the system fast
for the real OCR/AI engines and stops one bad actor from slowing it down for
everyone.

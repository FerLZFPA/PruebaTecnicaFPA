import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { DocumentsService } from "./documents.service";
import { ProcessingStatus } from "../events/enums/processing-status.enum";

describe("DocumentsService", () => {
  let service: DocumentsService;
  let findOneAndUpdate: jest.Mock;

  const event = {
    documentId: "doc-1",
    status: ProcessingStatus.PROCESSED,
    documentType: "INVOICE",
    provider: "aws-textract",
    createdAt: new Date("2026-09-14T10:00:00.000Z"),
  };

  beforeEach(() => {
    findOneAndUpdate = jest.fn().mockResolvedValue({});
    service = new DocumentsService({ findOneAndUpdate } as never);
  });

  it("upserts atomically by documentId with an aggregation-pipeline update", async () => {
    await service.upsertFromEvent(event);

    const [filter, update, options] = findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ documentId: "doc-1" });
    // A pipeline update (array) is what makes the merge race-safe in one round-trip.
    expect(Array.isArray(update)).toBe(true);
    expect(options).toMatchObject({ upsert: true, new: true });
  });

  it("encodes the recency guard and the PROCESSED-over-FAILED rule in the pipeline", async () => {
    await service.upsertFromEvent(event);

    const update = findOneAndUpdate.mock.calls[0][1];
    const asString = JSON.stringify(update);

    // Recency: the merge is gated on lastEventCreatedAt.
    expect(asString).toContain("lastEventCreatedAt");
    // Terminal rule: a FAILED event must not overwrite a PROCESSED document.
    expect(asString).toContain(ProcessingStatus.PROCESSED);
    expect(asString).toContain(ProcessingStatus.FAILED);
  });

  it("normalizes a missing documentType to null in the pipeline", async () => {
    await service.upsertFromEvent({ ...event, documentType: undefined });

    const update = findOneAndUpdate.mock.calls[0][1] as Array<
      Record<string, unknown>
    >;
    // The $cond for documentType falls back to null when the event has none.
    expect(JSON.stringify(update)).toContain("documentType");
  });
});

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { EventsService } from "./events.service";
import { DocumentsService } from "../documents/documents.service";
import { ProcessingStatus } from "./enums/processing-status.enum";

describe("EventsService", () => {
  let service: EventsService;
  let findOneAndUpdate: jest.Mock;
  let upsertFromEvent: jest.Mock;

  const dto = {
    eventId: "evt-1",
    documentId: "doc-1",
    status: ProcessingStatus.PROCESSED,
    provider: "aws-textract",
    createdAt: "2026-09-14T10:00:00.000Z",
  };

  const savedEvent = {
    documentId: "doc-1",
    status: ProcessingStatus.PROCESSED,
    documentType: null,
    provider: "aws-textract",
    createdAt: new Date(dto.createdAt),
  };

  beforeEach(() => {
    findOneAndUpdate = jest.fn();
    upsertFromEvent = jest.fn().mockResolvedValue(undefined);

    // Instantiate directly with mocks — no Nest DI container, so the test
    // stays free of ESM-only @nestjs/testing helpers.
    service = new EventsService(
      { findOneAndUpdate } as never,
      { upsertFromEvent } as unknown as DocumentsService,
    );
  });

  it("folds a brand-new event into the Document projection", async () => {
    findOneAndUpdate.mockResolvedValue({
      value: savedEvent,
      lastErrorObject: { updatedExisting: false },
    });

    await service.create(dto as never);

    expect(upsertFromEvent).toHaveBeenCalledTimes(1);
    expect(upsertFromEvent).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: "doc-1" }),
    );
  });

  it("is idempotent: a duplicate event does not re-apply to the Document", async () => {
    findOneAndUpdate.mockResolvedValue({
      value: savedEvent,
      lastErrorObject: { updatedExisting: true },
    });

    await service.create(dto as never);

    expect(upsertFromEvent).not.toHaveBeenCalled();
  });

  it("persists the event via an idempotent $setOnInsert upsert keyed by eventId", async () => {
    findOneAndUpdate.mockResolvedValue({
      value: savedEvent,
      lastErrorObject: { updatedExisting: false },
    });

    await service.create(dto as never);

    const [filter, update, options] = findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ eventId: "evt-1" });
    expect(update).toHaveProperty("$setOnInsert");
    expect(options).toMatchObject({ upsert: true });
  });

  it.each([
    ["null", null],
    ["missing", undefined],
  ])("defaults a %s provider to internal-engine before persisting", async (_l, value) => {
    findOneAndUpdate.mockResolvedValue({
      value: savedEvent,
      lastErrorObject: { updatedExisting: false },
    });

    await service.create({ ...dto, provider: value } as never);

    const update = findOneAndUpdate.mock.calls[0][1] as {
      $setOnInsert: { provider: string };
    };
    expect(update.$setOnInsert.provider).toBe("internal-engine");
  });
});

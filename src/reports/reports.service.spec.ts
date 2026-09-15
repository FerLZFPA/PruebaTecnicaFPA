import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { ReportsService } from "./reports.service";

describe("ReportsService", () => {
  let service: ReportsService;
  let aggregate: jest.Mock;

  beforeEach(() => {
    aggregate = jest.fn();
    service = new ReportsService({ aggregate } as never);
  });

  it("runs a single aggregation pipeline (no manual find() fan-out)", async () => {
    aggregate.mockResolvedValue([
      { statusDistribution: [], documentTypeBreakdown: [] },
    ]);

    await service.getSummary();

    expect(aggregate).toHaveBeenCalledTimes(1);
    const pipeline = aggregate.mock.calls[0][0];
    expect(Array.isArray(pipeline)).toBe(true);
    // Status + type breakdowns are computed together via a $facet.
    expect(JSON.stringify(pipeline)).toContain("$facet");
  });

  it("returns an empty summary shape when there are no documents", async () => {
    aggregate.mockResolvedValue([]);

    const summary = await service.getSummary();

    expect(summary).toEqual({
      statusDistribution: [],
      documentTypeBreakdown: [],
    });
  });

  it("passes the aggregation result through untouched", async () => {
    const result = {
      statusDistribution: [{ _id: "PROCESSED", count: 3 }],
      documentTypeBreakdown: [{ type: "INVOICE", count: 3, percentage: 100 }],
    };
    aggregate.mockResolvedValue([result]);

    const summary = await service.getSummary();

    expect(summary).toEqual(result);
  });
});

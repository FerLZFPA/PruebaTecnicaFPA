import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { DocumentDocument, Document } from "./schemas/document.schema";
import { ProcessingStatus } from "../events/enums/processing-status.enum";

@Injectable()
export class DocumentsService {
  constructor(
    @InjectModel(Document.name)
    private readonly documentModel: Model<DocumentDocument>,
  ) {}

  async upsertFromEvent(event: {
    documentId: string;
    status: string;
    documentType?: string | null;
    provider: string;
    createdAt: Date;
  }) {
    return this.documentModel.findOneAndUpdate(
      { documentId: event.documentId },
      [
        {
          $set: {
            // Whether this incoming event should be applied to the document.
            __apply: {
              $and: [
                // Rule 1: strictly newer than what we last applied (missing
                // lastEventCreatedAt compares as null → treated as older).
                {
                  $or: [
                    { $eq: ["$lastEventCreatedAt", null] },
                    { $lt: ["$lastEventCreatedAt", event.createdAt] },
                  ],
                },
                // Rule 2: not (stored PROCESSED AND incoming FAILED).
                {
                  $not: {
                    $and: [
                      { $eq: ["$status", ProcessingStatus.PROCESSED] },
                      { $eq: [event.status, ProcessingStatus.FAILED] },
                    ],
                  },
                },
              ],
            },
          },
        },
        {
          $set: {
            documentId: event.documentId,
            status: { $cond: ["$__apply", event.status, "$status"] },
            documentType: {
              $cond: ["$__apply", event.documentType ?? null, "$documentType"],
            },
            provider: { $cond: ["$__apply", event.provider, "$provider"] },
            lastEventCreatedAt: {
              $cond: ["$__apply", event.createdAt, "$lastEventCreatedAt"],
            },
          },
        },
        { $unset: "__apply" },
      ],
      {
        upsert: true,
        new: true,
        updatePipeline: true,
      },
    );
  }
}

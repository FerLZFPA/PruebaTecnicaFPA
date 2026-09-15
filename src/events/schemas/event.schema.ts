import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

import { ProcessingStatus } from "../enums/processing-status.enum";
import { ProcessingDocumentType } from "../enums/document-type.enum";

export type EventDocument = HydratedDocument<Event>;

@Schema({
  timestamps: {
    createdAt: "insertedAt",
    updatedAt: "updatedAt",
  },
})
export class Event {
  @Prop({ required: true, unique: true, index: true })
  eventId: string;

  @Prop({ required: true, index: true })
  documentId: string;

  @Prop({ type: String, enum: ProcessingStatus, required: true })
  status: ProcessingStatus;

  @Prop({
    type: String,
    enum: ProcessingDocumentType,
    default: null,
  })
  documentType: ProcessingDocumentType | null;

  @Prop({ type: String, default: "internal-engine" })
  provider: string;

  @Prop({ type: Object, default: null })
  metadata?: Record<string, unknown> | null;

  @Prop({ required: true, index: true })
  createdAt: Date;
}

export const EventSchema = SchemaFactory.createForClass(Event);

EventSchema.index({ documentId: 1, createdAt: -1 });

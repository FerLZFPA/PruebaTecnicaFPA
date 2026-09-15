import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

import { ProcessingStatus } from '../../events/enums/processing-status.enum';

export type DocumentDocument = HydratedDocument<Document>;

@Schema({
  timestamps: true,
})
export class Document {
  @Prop({
    required: true,
    unique: true,
    index: true,
  })
  documentId: string;

  @Prop({
    type: String,
    required: true,
    enum: ProcessingStatus,
    index: true,
  })
  status: ProcessingStatus;

  @Prop({ type: String, default: null })
  documentType?: string | null;

  @Prop({
    required: true,
  })
  provider: string;

  @Prop({
    required: true,
    type: Date,
  })
  lastEventCreatedAt: Date;
}

export const DocumentSchema = SchemaFactory.createForClass(Document);
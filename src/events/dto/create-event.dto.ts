import {
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from "class-validator";
import { ProcessingStatus } from "../enums/processing-status.enum";
import { Transform } from "class-transformer";
import { ProcessingDocumentType } from "../enums/document-type.enum";

export class CreateEventDto {
  @IsString()
  @IsNotEmpty()
  eventId: string;

  @IsString()
  @IsNotEmpty()
  documentId: string;

  @IsEnum(ProcessingStatus)
  status: ProcessingStatus;

  @IsOptional()
  @Transform(({ value }) => {
    return value === "undefined" ? undefined : value;
  })
  @IsEnum(ProcessingDocumentType)
  documentType?: ProcessingDocumentType | null;

  @IsOptional()
  @Transform(({ value }) => (value === "undefined" ? undefined : value))
  @IsString()
  provider?: string | null;

  @IsOptional()
  @Transform(({ value }) =>
    value === "undefined" || value === null ? null : value,
  )
  @IsObject()
  metadata?: Record<string, unknown> | null;

  @IsISO8601()
  createdAt: string;
}

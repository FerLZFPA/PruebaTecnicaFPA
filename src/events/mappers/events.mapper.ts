import { CreateEventDto } from "../dto/create-event.dto";

export class EventsMapper {
  static toEntity(dto: CreateEventDto) {
    return {
      ...dto,
      provider:
        dto.provider === null ||
        dto.provider === undefined ||
        dto.provider === "undefined"
          ? "internal-engine"
          : dto.provider,
      documentType:
        dto.documentType === null || 
        dto.documentType === undefined
          ? null
          : dto.documentType,
      createdAt: new Date(dto.createdAt),
    };
  }
}

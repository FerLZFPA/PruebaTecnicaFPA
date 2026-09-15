import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Event, EventDocument } from "./schemas/event.schema";
import { CreateEventDto } from "./dto/create-event.dto";
import { EventsMapper } from "./mappers/events.mapper";
import { DocumentsService } from "../documents/documents.service";

@Injectable()
export class EventsService {
  constructor(
    @InjectModel(Event.name)
    private readonly eventModel: Model<EventDocument>,
    private readonly documentsService: DocumentsService,
  ) {}
  async create(createEventDto: CreateEventDto) {
    const event = EventsMapper.toEntity(createEventDto);

    // Idempotent, race-safe insert: a single atomic upsert keyed by the unique
    // eventId. Concurrent duplicates can no longer both pass a findOne() and
    // then collide on E11000 — the DB decides the winner. $setOnInsert means
    // repeated deliveries of the same event never mutate the stored raw event.
    const result = await this.eventModel.findOneAndUpdate(
      { eventId: event.eventId },
      { $setOnInsert: event },
      { upsert: true, new: true, includeResultMetadata: true },
    );

    const savedEvent = result.value as EventDocument;
    const alreadyProcessed = result.lastErrorObject?.updatedExisting === true;

    // Only fold the event into the Document projection the first time we see it.
    // The Document upsert is itself idempotent (see DocumentsService), so this
    // is a fast-path optimisation rather than a correctness requirement.
    if (!alreadyProcessed) {
      await this.documentsService.upsertFromEvent({
        documentId: savedEvent.documentId,
        status: savedEvent.status,
        documentType: savedEvent.documentType,
        provider: savedEvent.provider,
        createdAt: savedEvent.createdAt,
      });
    }

    return savedEvent;
  }
}

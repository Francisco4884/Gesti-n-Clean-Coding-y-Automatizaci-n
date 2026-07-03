import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateEventEntity } from '../../database/entities/create-event.entity';
import { DeleteEventEntity } from '../../database/entities/delete-event.entity';
import { QueryEventEntity } from '../../database/entities/query-event.entity';
import { UpdateEventEntity } from '../../database/entities/update-event.entity';
import { CreateEventDto } from './dto/create-event.dto';

type EventEntity =
  | CreateEventEntity
  | UpdateEventEntity
  | DeleteEventEntity
  | QueryEventEntity;

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(CreateEventEntity)
    private readonly createEventsRepository: Repository<CreateEventEntity>,
    @InjectRepository(UpdateEventEntity)
    private readonly updateEventsRepository: Repository<UpdateEventEntity>,
    @InjectRepository(DeleteEventEntity)
    private readonly deleteEventsRepository: Repository<DeleteEventEntity>,
    @InjectRepository(QueryEventEntity)
    private readonly queryEventsRepository: Repository<QueryEventEntity>,
  ) {}

  async registerEvent(dto: CreateEventDto) {
    const event = {
      source: dto.source,
      entity: dto.entity,
      action: dto.action,
      title: dto.title,
      description: dto.description,
      payload: dto.payload ? JSON.stringify(dto.payload) : undefined,
      occurred_at: new Date(),
    };

    switch (dto.action) {
      case 'CREATE':
        return this.createEventsRepository.save(
          this.createEventsRepository.create(event),
        );
      case 'UPDATE':
        return this.updateEventsRepository.save(
          this.updateEventsRepository.create(event),
        );
      case 'DELETE':
        return this.deleteEventsRepository.save(
          this.deleteEventsRepository.create(event),
        );
      case 'QUERY':
        return this.queryEventsRepository.save(
          this.queryEventsRepository.create(event),
        );
    }
  }

  async findAll() {
    const events = await Promise.all([
      this.createEventsRepository.find(),
      this.updateEventsRepository.find(),
      this.deleteEventsRepository.find(),
      this.queryEventsRepository.find(),
    ]);

    return events.flat().sort(this.sortByRecentDate);
  }

  async findBySource(source: string) {
    const events = await Promise.all([
      this.createEventsRepository.find({ where: { source } }),
      this.updateEventsRepository.find({ where: { source } }),
      this.deleteEventsRepository.find({ where: { source } }),
      this.queryEventsRepository.find({ where: { source } }),
    ]);

    return events.flat().sort(this.sortByRecentDate);
  }

  async findByEntity(entity: string) {
    const events = await Promise.all([
      this.createEventsRepository.find({ where: { entity } }),
      this.updateEventsRepository.find({ where: { entity } }),
      this.deleteEventsRepository.find({ where: { entity } }),
      this.queryEventsRepository.find({ where: { entity } }),
    ]);

    return events.flat().sort(this.sortByRecentDate);
  }

  async getStats() {
    const [created, updated, deleted, queried] = await Promise.all([
      this.createEventsRepository.count(),
      this.updateEventsRepository.count(),
      this.deleteEventsRepository.count(),
      this.queryEventsRepository.count(),
    ]);

    return {
      total: created + updated + deleted + queried,
      byAction: {
        CREATE: created,
        UPDATE: updated,
        DELETE: deleted,
        QUERY: queried,
      },
    };
  }

  private sortByRecentDate(left: EventEntity, right: EventEntity) {
    return (
      new Date(right.occurred_at).getTime() -
      new Date(left.occurred_at).getTime()
    );
  }
}

import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  PayloadTooLargeException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateEventDto } from './dto/create-event.dto';
import { CreateEventEntity } from '../../database/entities/create-event.entity';
import { UpdateEventEntity } from '../../database/entities/update-event.entity';
import { DeleteEventEntity } from '../../database/entities/delete-event.entity';
import { QueryEventEntity } from '../../database/entities/query-event.entity';

export interface PaginatedEvents {
  data: object[];
  total: number;
  limit: number;
  offset: number;
}

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);
  private readonly maxPayloadBytes = 8 * 1024;
  private readonly defaultLimit = 20;
  private readonly minLimit = 1;
  private readonly maxLimit = 100;
  constructor(
    @InjectRepository(CreateEventEntity)
    private readonly createRepo: Repository<CreateEventEntity>,
    @InjectRepository(UpdateEventEntity)
    private readonly updateRepo: Repository<UpdateEventEntity>,
    @InjectRepository(DeleteEventEntity)
    private readonly deleteRepo: Repository<DeleteEventEntity>,
    @InjectRepository(QueryEventEntity)
    private readonly queryRepo: Repository<QueryEventEntity>,
  ) {}

  private normalizePagination(
    limit?: number | string,
    offset?: number | string,
  ): { limit: number; offset: number } {
    const parsedLimit = this.parsePageNumber(limit, this.defaultLimit);
    const parsedOffset = this.parsePageNumber(offset, 0);

    if (
      parsedLimit === null ||
      parsedLimit < this.minLimit ||
      parsedLimit > this.maxLimit
    ) {
      throw new BadRequestException(
        `limit debe ser un entero entre ${this.minLimit} y ${this.maxLimit}`,
      );
    }

    if (parsedOffset === null || parsedOffset < 0) {
      throw new BadRequestException(
        'offset debe ser un entero mayor o igual a 0',
      );
    }

    return { limit: parsedLimit, offset: parsedOffset };
  }

  private parsePageNumber(
    value: number | string | undefined,
    fallback: number,
  ): number | null {
    if (value === undefined || value === null || value === '') return fallback;
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : null;
  }

  private normalizeDate(legacy?: string | Date): Date {
    if (!legacy) return new Date();
    if (legacy instanceof Date) return legacy;
    const parsed = new Date(legacy);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  async registerEvent(
    dto: CreateEventDto,
  ): Promise<{ ok: boolean; id: number }> {
    const action = (dto.action ?? '').toUpperCase();
    const payloadStr = JSON.stringify(dto.payload ?? {});
    if (Buffer.byteLength(payloadStr, 'utf8') > this.maxPayloadBytes) {
      throw new PayloadTooLargeException('payload supera 8KB');
    }

    // Fecha guardada en formato local, no UTC (debilidad intencional)
    const occurredAt = new Date().toISOString();

    try {
      if (action === 'CREATE') {
        const ev = this.createRepo.create({
          source: dto.source,
          entity: dto.entity,
          action: dto.action,
          title: dto.title,
          description: dto.description,
          payload: payloadStr,
          occurred_at: occurredAt,
        });
        const saved = await this.createRepo.save(ev);
        this.logger.log(`CREATE event persisted id=${saved.id}`);
        return { ok: true, id: saved.id };
      }

      if (action === 'UPDATE') {
        const ev = this.updateRepo.create({
          source: dto.source,
          entity: dto.entity,
          action: dto.action,
          title: dto.title,
          description: dto.description,
          payload: payloadStr,
          occurred_at: occurredAt,
        });
        const saved = await this.updateRepo.save(ev);
        this.logger.log(`UPDATE event persisted id=${saved.id}`);
        return { ok: true, id: saved.id };
      }

      if (action === 'DELETE') {
        const ev = this.deleteRepo.create({
          source: dto.source,
          entity: dto.entity,
          action: dto.action,
          title: dto.title,
          payload: payloadStr,
          occurred_at: occurredAt,
        });
        const saved = await this.deleteRepo.save(ev);
        this.logger.log(`DELETE event persisted id=${saved.id}`);
        return { ok: true, id: saved.id };
      }

      if (action === 'QUERY') {
        const ev = this.queryRepo.create({
          source: dto.source,
          entity: dto.entity,
          action: dto.action,
          title: dto.title,
          description: dto.description,
          payload: payloadStr,
          occurred_at: occurredAt,
        });
        const saved = await this.queryRepo.save(ev);
        this.logger.log(`QUERY event persisted id=${saved.id}`);
        return { ok: true, id: saved.id };
      }
    } catch (err) {
      this.logger.error(`Fallo al persistir ${dto.action}`, err as Error);
      throw new InternalServerErrorException('No se pudo registrar el evento');
    }

    throw new BadRequestException(
      `Acción no soportada: "${dto.action}". Use CREATE | UPDATE | DELETE | QUERY.`,
    );
  }

  async findAll(
    limit?: number | string,
    offset?: number | string,
  ): Promise<PaginatedEvents> {
    const page = this.normalizePagination(limit, offset);
    const orderByDate = { occurred_at: 'ASC' as const };
    // Solo se traen las filas que pueden entrar en la página solicitada.
    const take = page.offset + page.limit;
    const [
      creates,
      updates,
      deletes,
      queries,
      createCount,
      updateCount,
      deleteCount,
      queryCount,
    ] = await Promise.all([
      this.createRepo.find({ order: orderByDate, take }),
      this.updateRepo.find({ order: orderByDate, take }),
      this.deleteRepo.find({ order: orderByDate, take }),
      this.queryRepo.find({ order: orderByDate, take }),
      this.createRepo.count(),
      this.updateRepo.count(),
      this.deleteRepo.count(),
      this.queryRepo.count(),
    ]);

    type EventRow = Record<string, unknown> & {
      _sortTime: number;
      _table: string;
      occurred_at?: Date | string;
    };
    const withTable = (
      events: Array<{ occurred_at?: Date | string }>,
      table: string,
    ): EventRow[] =>
      events.map((event) => ({
        ...event,
        _table: table,
        _sortTime: this.normalizeDate(event.occurred_at).getTime(),
      }));

    const buckets = [
      withTable(creates, 'create_events'),
      withTable(updates, 'update_events'),
      withTable(deletes, 'delete_events'),
      withTable(queries, 'query_events'),
    ];
    const indexes = buckets.map(() => 0);
    const merged: object[] = [];

    while (merged.length < take) {
      let nextBucket = -1;
      let nextTime = Number.POSITIVE_INFINITY;

      for (let i = 0; i < buckets.length; i++) {
        const candidate = buckets[i][indexes[i]];
        if (candidate && candidate._sortTime < nextTime) {
          nextBucket = i;
          nextTime = candidate._sortTime;
        }
      }

      if (nextBucket === -1) break;

      const { _sortTime, ...event } =
        buckets[nextBucket][indexes[nextBucket]++];
      merged.push(event);
    }

    return {
      data: merged.slice(page.offset),
      total: createCount + updateCount + deleteCount + queryCount,
      limit: page.limit,
      offset: page.offset,
    };
  }

  async findBySource(source: string): Promise<object[]> {
    const creates = await this.createRepo.findBy({ source });
    const updates = await this.updateRepo.findBy({ source });
    const deletes = await this.deleteRepo.findBy({ source });
    const queries = await this.queryRepo.findBy({ source });
    return [...creates, ...updates, ...deletes, ...queries];
  }

  async findByEntity(entity: string): Promise<object[]> {
    const normalizedEntity = this.normalizeEntity(entity);
    const creates = await this.createRepo.findBy({ entity: normalizedEntity });
    const updates = await this.updateRepo.findBy({ entity: normalizedEntity });
    const deletes = await this.deleteRepo.findBy({ entity: normalizedEntity });
    const queries = await this.queryRepo.findBy({ entity: normalizedEntity });
    return [...creates, ...updates, ...deletes, ...queries];
  }

  private normalizeEntity(entity: string): string {
    const normalizedEntity = entity.trim();
    if (!normalizedEntity) {
      throw new BadRequestException('entity es obligatorio');
    }

    if (normalizedEntity.length > 60) {
      throw new BadRequestException('entity supera 60 caracteres');
    }

    if (/[\u0000-\u001f\u007f]/.test(normalizedEntity)) {
      throw new BadRequestException('entity contiene caracteres no válidos');
    }

    return normalizedEntity;
  }

  async getStats(): Promise<object> {
    const lastEventQuery = (repo: Repository<{ occurred_at: Date }>) =>
      repo
        .createQueryBuilder('event')
        .select('MAX(event.occurred_at)', 'lastEventAt')
        .getRawOne<{ lastEventAt: string | null }>();
    const [
      createCount,
      updateCount,
      deleteCount,
      queryCount,
      createLast,
      updateLast,
      deleteLast,
      queryLast,
    ] = await Promise.all([
      this.createRepo.count(),
      this.updateRepo.count(),
      this.deleteRepo.count(),
      this.queryRepo.count(),
      lastEventQuery(this.createRepo),
      lastEventQuery(this.updateRepo),
      lastEventQuery(this.deleteRepo),
      lastEventQuery(this.queryRepo),
    ]);
    const lastEventTimes = [
      createLast?.lastEventAt,
      updateLast?.lastEventAt,
      deleteLast?.lastEventAt,
      queryLast?.lastEventAt,
    ]
      .filter((date): date is string => Boolean(date))
      .map((date) => this.normalizeDate(date).getTime());

    return {
      create: createCount,
      update: updateCount,
      delete: deleteCount,
      query: queryCount,
      total: createCount + updateCount + deleteCount + queryCount,
      lastEventAt: lastEventTimes.length
        ? new Date(Math.max(...lastEventTimes)).toISOString()
        : null,
    };
  }
}

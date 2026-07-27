import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FindOperator } from 'typeorm';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { CreateEventEntity } from '../../database/entities/create-event.entity';
import { UpdateEventEntity } from '../../database/entities/update-event.entity';
import { DeleteEventEntity } from '../../database/entities/delete-event.entity';
import { QueryEventEntity } from '../../database/entities/query-event.entity';

type StoredEvent = { id: number; occurred_at: string };

type EventWhere = { occurred_at?: FindOperator<Date> };

type FindArgs = {
  where: EventWhere;
  order?: Record<string, string>;
  take?: number;
};

type RepoMock = {
  rows: StoredEvent[];
  create: jest.Mock;
  save: jest.Mock;
  find: jest.Mock<Promise<StoredEvent[]>, [FindArgs]>;
  count: jest.Mock;
};

const buildRepoMock = (): RepoMock => {
  const repo: RepoMock = {
    rows: [],
    create: jest.fn((data: object) => data),
    save: jest.fn((data: object) => Promise.resolve({ ...data, id: 1 })),
    find: jest.fn((options: FindArgs) =>
      Promise.resolve(repo.rows.slice(0, options.take)),
    ),
    count: jest.fn(() => Promise.resolve(repo.rows.length)),
  };
  return repo;
};

const buildRows = (amount: number): StoredEvent[] =>
  Array.from({ length: amount }, (_, index) => ({
    id: index + 1,
    occurred_at: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
  }));

const firstFindArgs = (repo: RepoMock): FindArgs => repo.find.mock.calls[0][0];

describe('EventsService', () => {
  let service: EventsService;
  let repos: Record<'create' | 'update' | 'delete' | 'query', RepoMock>;

  const baseDto = {
    source: 'erp',
    entity: 'factura',
    title: 'Evento de prueba',
  };

  beforeEach(async () => {
    repos = {
      create: buildRepoMock(),
      update: buildRepoMock(),
      delete: buildRepoMock(),
      query: buildRepoMock(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        {
          provide: getRepositoryToken(CreateEventEntity),
          useValue: repos.create,
        },
        {
          provide: getRepositoryToken(UpdateEventEntity),
          useValue: repos.update,
        },
        {
          provide: getRepositoryToken(DeleteEventEntity),
          useValue: repos.delete,
        },
        {
          provide: getRepositoryToken(QueryEventEntity),
          useValue: repos.query,
        },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
  });

  describe('registerEvent', () => {
    it('responde 400 cuando la acción no es soportada', async () => {
      const dto = {
        ...baseDto,
        action: 'ARCHIVE',
      } as unknown as CreateEventDto;

      const error = await service
        .registerEvent(dto)
        .catch((err: unknown) => err);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getStatus()).toBe(400);
    });

    it('indica las acciones válidas en el mensaje de error', async () => {
      const dto = {
        ...baseDto,
        action: 'ARCHIVE',
      } as unknown as CreateEventDto;

      await expect(service.registerEvent(dto)).rejects.toThrow(
        /CREATE \| UPDATE \| DELETE \| QUERY/,
      );
    });

    it('mantiene el registro de una acción válida', async () => {
      const dto = { ...baseDto, action: 'CREATE' } as CreateEventDto;

      await expect(service.registerEvent(dto)).resolves.toEqual({
        ok: true,
        id: 1,
      });
      expect(repos.create.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('findAll', () => {
    it('aplica limit=20 y offset=0 cuando no se envían query params', async () => {
      repos.create.rows = buildRows(25);

      const result = await service.findAll();

      expect(result.limit).toBe(20);
      expect(result.offset).toBe(0);
      expect(result.total).toBe(25);
      expect(result.data).toHaveLength(20);
    });

    it('consulta las cuatro tablas sin filtros cuando no se envía ninguno', async () => {
      repos.create.rows = buildRows(3);

      await service.findAll();

      for (const repo of Object.values(repos)) {
        expect(repo.find).toHaveBeenCalledTimes(1);
        expect(firstFindArgs(repo).where).toEqual({});
      }
    });

    it('devuelve data vacía cuando el offset supera el total', async () => {
      repos.create.rows = buildRows(5);

      const result = await service.findAll({ limit: 10, offset: 50 });

      expect(result.data).toEqual([]);
      expect(result.total).toBe(5);
      expect(result.limit).toBe(10);
      expect(result.offset).toBe(50);
    });

    it('responde 400 cuando limit está fuera del rango 1-100', async () => {
      repos.create.rows = buildRows(5);

      for (const invalidLimit of [0, 101, -1, 'abc']) {
        const error = await service
          .findAll({ limit: invalidLimit })
          .catch((err: unknown) => err);

        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).getStatus()).toBe(400);
      }
    });

    it('combina el filtro por action con la paginación', async () => {
      repos.create.rows = buildRows(25);
      repos.update.rows = buildRows(9);

      const result = await service.findAll({
        action: 'CREATE',
        limit: 5,
        offset: 10,
      });

      expect(repos.create.find).toHaveBeenCalledTimes(1);
      expect(repos.update.find).not.toHaveBeenCalled();
      expect(result.total).toBe(25);
      expect(result.limit).toBe(5);
      expect(result.offset).toBe(10);
      expect(result.data).toHaveLength(5);
    });

    it('combina el filtro por action, el rango de fechas y la paginación', async () => {
      repos.create.rows = buildRows(25);
      const from = '2026-01-01T00:05:00.000Z';
      const to = '2026-01-01T00:20:00.000Z';

      const result = await service.findAll({
        action: 'create',
        from,
        to,
        limit: 5,
        offset: 2,
      });

      const { where, take } = firstFindArgs(repos.create);
      expect(take).toBe(7);
      expect(where.occurred_at).toBeInstanceOf(FindOperator);
      expect(where.occurred_at?.type).toBe('between');
      expect(where.occurred_at?.value).toEqual([new Date(from), new Date(to)]);
      expect(repos.create.count).toHaveBeenCalledWith({ where });
      expect(repos.update.count).not.toHaveBeenCalled();
      expect(result.limit).toBe(5);
      expect(result.offset).toBe(2);
    });

    it('aplica solo el límite inferior cuando se envía from sin to', async () => {
      repos.create.rows = buildRows(3);

      await service.findAll({ from: '2026-01-01' });

      const { where } = firstFindArgs(repos.create);
      expect(where.occurred_at?.type).toBe('moreThanOrEqual');
      expect(where.occurred_at?.value).toEqual(new Date('2026-01-01'));
    });

    it('responde 400 cuando from o to no son fechas ISO válidas', async () => {
      const invalidRanges = [
        { from: 'ayer' },
        { to: '01/02/2026' },
        { from: '2026-13-45' },
      ];

      for (const range of invalidRanges) {
        const error = await service.findAll(range).catch((err: unknown) => err);

        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).getStatus()).toBe(400);
      }
    });

    it('responde 400 cuando la action solicitada no existe', async () => {
      const error = await service
        .findAll({ action: 'ARCHIVE' })
        .catch((err: unknown) => err);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getStatus()).toBe(400);
    });
  });
});

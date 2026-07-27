import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { CreateEventEntity } from '../../database/entities/create-event.entity';
import { UpdateEventEntity } from '../../database/entities/update-event.entity';
import { DeleteEventEntity } from '../../database/entities/delete-event.entity';
import { QueryEventEntity } from '../../database/entities/query-event.entity';

type StoredEvent = { id: number; occurred_at: string; source?: string };

type LastEventRow = {
  lastEventAt: string | null;
};

type QueryBuilderMock = {
  select: jest.MockedFunction<
    (selection: string, alias: string) => QueryBuilderMock
  >;
  addSelect: jest.MockedFunction<
    (selection: string, alias: string) => QueryBuilderMock
  >;
  groupBy: jest.MockedFunction<(group: string) => QueryBuilderMock>;
  getRawOne: jest.MockedFunction<() => Promise<LastEventRow>>;
  getRawMany: jest.MockedFunction<
    () => Promise<Array<{ source: string; count: number }>>
  >;
};

type RepoMock = {
  rows: StoredEvent[];
  lastEventAt: string | null;
  create: jest.Mock;
  save: jest.Mock;
  find: jest.Mock;
  count: jest.Mock;
  createQueryBuilder: jest.MockedFunction<(alias: string) => QueryBuilderMock>;
  queryBuilder: QueryBuilderMock;
};

const buildRepoMock = (): RepoMock => {
  const repo = {
    rows: [],
    lastEventAt: null,
    create: jest.fn((data: object) => data),
    save: jest.fn((data: object) => Promise.resolve({ ...data, id: 1 })),
    find: jest.fn(({ take }: { take?: number }) =>
      Promise.resolve(repo.rows.slice(0, take)),
    ),
    count: jest.fn(() => Promise.resolve(repo.rows.length)),
  } as RepoMock;
  const queryBuilder: QueryBuilderMock = {
    select: jest.fn((): QueryBuilderMock => queryBuilder),
    addSelect: jest.fn((): QueryBuilderMock => queryBuilder),
    groupBy: jest.fn((): QueryBuilderMock => queryBuilder),
    getRawOne: jest.fn(() =>
      Promise.resolve({ lastEventAt: repo.lastEventAt }),
    ),
    getRawMany: jest.fn(() => {
      const bySource = repo.rows.reduce<Record<string, number>>((acc, row) => {
        if (!row.source) return acc;

        acc[row.source] = (acc[row.source] ?? 0) + 1;
        return acc;
      }, {});

      return Promise.resolve(
        Object.entries(bySource).map(([source, count]) => ({
          source,
          count,
        })),
      );
    }),
  };
  repo.queryBuilder = queryBuilder;
  repo.createQueryBuilder = jest.fn(() => queryBuilder);
  return repo;
};

const buildRows = (amount: number, source = 'erp'): StoredEvent[] =>
  Array.from({ length: amount }, (_, index) => ({
    id: index + 1,
    source,
    occurred_at: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
  }));

describe('EventsService', () => {
  let service: EventsService;
  let createRepo: RepoMock;
  let updateRepo: RepoMock;
  let deleteRepo: RepoMock;
  let queryRepo: RepoMock;

  const baseDto = {
    source: 'erp',
    entity: 'factura',
    title: 'Evento de prueba',
  };

  beforeEach(async () => {
    createRepo = buildRepoMock();
    updateRepo = buildRepoMock();
    deleteRepo = buildRepoMock();
    queryRepo = buildRepoMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        {
          provide: getRepositoryToken(CreateEventEntity),
          useValue: createRepo,
        },
        {
          provide: getRepositoryToken(UpdateEventEntity),
          useValue: updateRepo,
        },
        {
          provide: getRepositoryToken(DeleteEventEntity),
          useValue: deleteRepo,
        },
        {
          provide: getRepositoryToken(QueryEventEntity),
          useValue: queryRepo,
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
      expect(createRepo.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('findAll', () => {
    it('aplica limit=20 y offset=0 cuando no se envían query params', async () => {
      createRepo.rows = buildRows(25);

      const result = await service.findAll();

      expect(result.limit).toBe(20);
      expect(result.offset).toBe(0);
      expect(result.total).toBe(25);
      expect(result.data).toHaveLength(20);
    });

    it('devuelve data vacía cuando el offset supera el total', async () => {
      createRepo.rows = buildRows(5);

      const result = await service.findAll(10, 50);

      expect(result.data).toEqual([]);
      expect(result.total).toBe(5);
      expect(result.limit).toBe(10);
      expect(result.offset).toBe(50);
    });

    it('responde 400 cuando limit está fuera del rango 1-100', async () => {
      createRepo.rows = buildRows(5);

      for (const invalidLimit of [0, 101, -1, 'abc']) {
        const error = await service
          .findAll(invalidLimit)
          .catch((err: unknown) => err);

        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).getStatus()).toBe(400);
      }
    });
  });

  describe('getStats', () => {
    it('calcula conteos, total y la fecha mas reciente entre todos los eventos', async () => {
      createRepo.rows = buildRows(2);
      updateRepo.rows = buildRows(3);
      deleteRepo.rows = buildRows(4);
      queryRepo.rows = buildRows(5);
      createRepo.lastEventAt = '2026-01-10T08:00:00.000Z';
      updateRepo.lastEventAt = '2026-01-11T08:00:00.000Z';
      deleteRepo.lastEventAt = '2026-01-09T08:00:00.000Z';
      queryRepo.lastEventAt = '2026-01-12T08:00:00.000Z';

      await expect(service.getStats()).resolves.toEqual({
        create: 2,
        update: 3,
        delete: 4,
        query: 5,
        total: 14,
        lastEventAt: '2026-01-12T08:00:00.000Z',
        bySource: {
          erp: 14,
        },
      });

      for (const repo of [createRepo, updateRepo, deleteRepo, queryRepo]) {
        expect(repo.count).toHaveBeenCalledTimes(1);
        expect(repo.createQueryBuilder).toHaveBeenCalledWith('event');
        expect(repo.queryBuilder.select).toHaveBeenCalledWith(
          'MAX(event.occurred_at)',
          'lastEventAt',
        );
        expect(repo.queryBuilder.getRawOne).toHaveBeenCalledTimes(1);
        expect(repo.queryBuilder.select).toHaveBeenCalledWith(
          'event.source',
          'source',
        );
        expect(repo.queryBuilder.addSelect).toHaveBeenCalledWith(
          'COUNT(event.id)',
          'count',
        );
        expect(repo.queryBuilder.groupBy).toHaveBeenCalledWith('event.source');
        expect(repo.queryBuilder.getRawMany).toHaveBeenCalledTimes(1);
      }
    });

    it('devuelve conteos en cero y lastEventAt null cuando no existen eventos', async () => {
      await expect(service.getStats()).resolves.toEqual({
        create: 0,
        update: 0,
        delete: 0,
        query: 0,
        total: 0,
        lastEventAt: null,
        bySource: {},
      });
    });

    it('agrupa correctamente eventos por source', async () => {
      createRepo.rows = [
        ...buildRows(2, 'laptops'),
        ...buildRows(1, 'usuarios'),
      ];

      await expect(service.getStats()).resolves.toMatchObject({
        bySource: {
          laptops: 2,
          usuarios: 1,
        },
      });
    });

    it('suma eventos de diferentes acciones con el mismo source', async () => {
      createRepo.rows = buildRows(1, 'laptops');
      updateRepo.rows = buildRows(2, 'laptops');
      deleteRepo.rows = buildRows(1, 'laptops');
      queryRepo.rows = buildRows(3, 'laptops');

      await expect(service.getStats()).resolves.toMatchObject({
        bySource: {
          laptops: 7,
        },
      });
    });

    it('incluye multiples sources en bySource sin cambiar los conteos existentes', async () => {
      createRepo.rows = buildRows(2, 'laptops');
      updateRepo.rows = buildRows(1, 'usuarios');
      deleteRepo.rows = buildRows(1, 'laptops');
      queryRepo.rows = buildRows(1, 'usuarios');
      createRepo.lastEventAt = '2026-01-10T08:00:00.000Z';
      updateRepo.lastEventAt = '2026-01-11T08:00:00.000Z';
      deleteRepo.lastEventAt = '2026-01-09T08:00:00.000Z';
      queryRepo.lastEventAt = '2026-01-12T08:00:00.000Z';

      await expect(service.getStats()).resolves.toEqual({
        create: 2,
        update: 1,
        delete: 1,
        query: 1,
        total: 5,
        lastEventAt: '2026-01-12T08:00:00.000Z',
        bySource: {
          laptops: 3,
          usuarios: 2,
        },
      });
    });
  });
});

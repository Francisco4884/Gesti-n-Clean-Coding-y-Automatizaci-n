import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { CreateEventEntity } from '../../database/entities/create-event.entity';
import { UpdateEventEntity } from '../../database/entities/update-event.entity';
import { DeleteEventEntity } from '../../database/entities/delete-event.entity';
import { QueryEventEntity } from '../../database/entities/query-event.entity';

type StoredEvent = { id: number; occurred_at: string };

type RepoMock = {
  rows: StoredEvent[];
  create: jest.Mock;
  save: jest.Mock;
  find: jest.Mock;
  count: jest.Mock;
};

const buildRepoMock = (): RepoMock => {
  const repo: RepoMock = {
    rows: [],
    create: jest.fn((data: object) => data),
    save: jest.fn((data: object) => Promise.resolve({ ...data, id: 1 })),
    find: jest.fn(({ take }: { take?: number }) =>
      Promise.resolve(repo.rows.slice(0, take)),
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

describe('EventsService', () => {
  let service: EventsService;
  let createRepo: RepoMock;

  const baseDto = {
    source: 'erp',
    entity: 'factura',
    title: 'Evento de prueba',
  };

  beforeEach(async () => {
    createRepo = buildRepoMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        {
          provide: getRepositoryToken(CreateEventEntity),
          useValue: createRepo,
        },
        {
          provide: getRepositoryToken(UpdateEventEntity),
          useValue: buildRepoMock(),
        },
        {
          provide: getRepositoryToken(DeleteEventEntity),
          useValue: buildRepoMock(),
        },
        {
          provide: getRepositoryToken(QueryEventEntity),
          useValue: buildRepoMock(),
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
});

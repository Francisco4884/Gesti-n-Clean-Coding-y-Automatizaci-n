import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateEventEntity } from '../../database/entities/create-event.entity';
import { DeleteEventEntity } from '../../database/entities/delete-event.entity';
import { QueryEventEntity } from '../../database/entities/query-event.entity';
import { UpdateEventEntity } from '../../database/entities/update-event.entity';
import { EventsService } from './events.service';

type RepoMock = Pick<
  Repository<any>,
  'create' | 'save' | 'findBy' | 'find' | 'count' | 'createQueryBuilder'
>;

const createRepositoryMock = (): RepoMock => ({
  create: jest.fn((value: unknown) => value),
  save: jest.fn(async (value: Record<string, unknown>) => ({ ...value, id: 1 })),
  findBy: jest.fn(async () => []),
  find: jest.fn(async () => []),
  count: jest.fn(async () => 0),
  createQueryBuilder: jest.fn(),
});

describe('EventsService', () => {
  let service: EventsService;
  let createRepo: RepoMock;
  let updateRepo: RepoMock;
  let deleteRepo: RepoMock;
  let queryRepo: RepoMock;

  const createDto = (action: 'CREATE' | 'UPDATE' | 'DELETE' | 'QUERY') => ({
    source: 'service-a',
    entity: 'orders',
    action,
    title: 'Event title',
    description: 'Event description',
    payload: { ok: true },
  });

  beforeEach(async () => {
    createRepo = createRepositoryMock();
    updateRepo = createRepositoryMock();
    deleteRepo = createRepositoryMock();
    queryRepo = createRepositoryMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: getRepositoryToken(CreateEventEntity), useValue: createRepo },
        { provide: getRepositoryToken(UpdateEventEntity), useValue: updateRepo },
        { provide: getRepositoryToken(DeleteEventEntity), useValue: deleteRepo },
        { provide: getRepositoryToken(QueryEventEntity), useValue: queryRepo },
      ],
    }).compile();

    service = module.get(EventsService);
  });

  describe('registerEvent', () => {
    it.each([
      ['CREATE', 'createRepo'],
      ['UPDATE', 'updateRepo'],
      ['DELETE', 'deleteRepo'],
      ['QUERY', 'queryRepo'],
    ] as const)('uses the %s repository', async (action, repoName) => {
      const repository = {
        createRepo,
        updateRepo,
        deleteRepo,
        queryRepo,
      }[repoName];
      const result = await service.registerEvent(createDto(action));

      expect(result).toEqual({ ok: true, id: 1 });
      expect(repository.create).toHaveBeenCalledTimes(1);
      expect(repository.save).toHaveBeenCalledTimes(1);
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'service-a',
          entity: 'orders',
          action,
          title: 'Event title',
          payload: JSON.stringify({ ok: true }),
          occurred_at: expect.any(String),
        }),
      );
      expect(repository.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('findByEntity', () => {
    it('trimmea y valida el entity antes de consultar', async () => {
      createRepo.findBy.mockResolvedValueOnce([{ id: 1 }]);
      updateRepo.findBy.mockResolvedValueOnce([{ id: 2 }]);
      deleteRepo.findBy.mockResolvedValueOnce([{ id: 3 }]);
      queryRepo.findBy.mockResolvedValueOnce([{ id: 4 }]);

      const result = await service.findByEntity('  orders  ');

      expect(createRepo.findBy).toHaveBeenCalledWith({ entity: 'orders' });
      expect(updateRepo.findBy).toHaveBeenCalledWith({ entity: 'orders' });
      expect(deleteRepo.findBy).toHaveBeenCalledWith({ entity: 'orders' });
      expect(queryRepo.findBy).toHaveBeenCalledWith({ entity: 'orders' });
      expect(result).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]);
    });

    it.each([
      ['   ', 'entity es obligatorio'],
      ['\t', 'entity es obligatorio'],
      ['a'.repeat(61), 'entity supera 60 caracteres'],
      [`bad\u0001value`, 'entity contiene caracteres no válidos'],
    ] as const)('rechaza %j con %s', async (entity, message) => {
      await expectAsyncRejection(() => service.findByEntity(entity), message);
    });
  });

  describe('findBySource', () => {
    it('aplica la misma normalización que entity', async () => {
      createRepo.findBy.mockResolvedValueOnce([{ id: 1 }]);
      updateRepo.findBy.mockResolvedValueOnce([{ id: 2 }]);
      deleteRepo.findBy.mockResolvedValueOnce([{ id: 3 }]);
      queryRepo.findBy.mockResolvedValueOnce([{ id: 4 }]);

      const result = await service.findBySource('  gateway  ');

      expect(createRepo.findBy).toHaveBeenCalledWith({ source: 'gateway' });
      expect(updateRepo.findBy).toHaveBeenCalledWith({ source: 'gateway' });
      expect(deleteRepo.findBy).toHaveBeenCalledWith({ source: 'gateway' });
      expect(queryRepo.findBy).toHaveBeenCalledWith({ source: 'gateway' });
      expect(result).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]);
    });

    it.each([
      ['   ', 'source es obligatorio'],
      ['\t', 'source es obligatorio'],
      ['a'.repeat(61), 'source supera 60 caracteres'],
      [`bad\u0001value`, 'source contiene caracteres no válidos'],
    ] as const)('rechaza %j con %s', async (source, message) => {
      await expectAsyncRejection(() => service.findBySource(source), message);
    });
  });
});

async function expectAsyncRejection(
  fn: () => Promise<unknown>,
  message: string,
) {
  try {
    await fn();
    throw new Error('Expected promise to reject');
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toContain(message);
  }
}
import { Repository } from 'typeorm';
import { CreateEventEntity } from '../../database/entities/create-event.entity';
import { DeleteEventEntity } from '../../database/entities/delete-event.entity';
import { QueryEventEntity } from '../../database/entities/query-event.entity';
import { UpdateEventEntity } from '../../database/entities/update-event.entity';
import { EventsService } from './events.service';

type LastEventRow = {
  lastEventAt: string | null;
};

type QueryBuilderMock = {
  select: jest.MockedFunction<
    (selection: string, alias: string) => QueryBuilderMock
  >;
  getRawOne: jest.MockedFunction<() => Promise<LastEventRow>>;
};

type StatsRepositoryMock = {
  count: jest.MockedFunction<() => Promise<number>>;
  createQueryBuilder: jest.MockedFunction<(alias: string) => QueryBuilderMock>;
  queryBuilder: QueryBuilderMock;
};

const createRepositoryMock = (
  count: number,
  lastEventAt: string | null,
): StatsRepositoryMock => {
  const queryBuilder: QueryBuilderMock = {
    select: jest.fn((): QueryBuilderMock => queryBuilder),
    getRawOne: jest.fn(() => Promise.resolve({ lastEventAt })),
  };

  return {
    count: jest.fn(() => Promise.resolve(count)),
    createQueryBuilder: jest.fn(() => queryBuilder),
    queryBuilder,
  };
};

describe('EventsService', () => {
  let createRepo: StatsRepositoryMock;
  let updateRepo: StatsRepositoryMock;
  let deleteRepo: StatsRepositoryMock;
  let queryRepo: StatsRepositoryMock;
  let service: EventsService;

  const buildService = (): void => {
    service = new EventsService(
      createRepo as unknown as Repository<CreateEventEntity>,
      updateRepo as unknown as Repository<UpdateEventEntity>,
      deleteRepo as unknown as Repository<DeleteEventEntity>,
      queryRepo as unknown as Repository<QueryEventEntity>,
    );
  };

  describe('getStats', () => {
    it('returns counts, total, and the latest event date across all event repositories', async () => {
      createRepo = createRepositoryMock(2, '2026-01-10T08:00:00.000Z');
      updateRepo = createRepositoryMock(3, '2026-01-11T08:00:00.000Z');
      deleteRepo = createRepositoryMock(4, '2026-01-09T08:00:00.000Z');
      queryRepo = createRepositoryMock(5, '2026-01-12T08:00:00.000Z');
      buildService();

      await expect(service.getStats()).resolves.toEqual({
        create: 2,
        update: 3,
        delete: 4,
        query: 5,
        total: 14,
        lastEventAt: '2026-01-12T08:00:00.000Z',
      });

      for (const repo of [createRepo, updateRepo, deleteRepo, queryRepo]) {
        expect(repo.count).toHaveBeenCalledTimes(1);
        expect(repo.createQueryBuilder).toHaveBeenCalledWith('event');
        expect(repo.queryBuilder.select).toHaveBeenCalledWith(
          'MAX(event.occurred_at)',
          'lastEventAt',
        );
        expect(repo.queryBuilder.getRawOne).toHaveBeenCalledTimes(1);
      }
    });

    it('returns zero counts and null lastEventAt when no events are registered', async () => {
      createRepo = createRepositoryMock(0, null);
      updateRepo = createRepositoryMock(0, null);
      deleteRepo = createRepositoryMock(0, null);
      queryRepo = createRepositoryMock(0, null);
      buildService();

      await expect(service.getStats()).resolves.toEqual({
        create: 0,
        update: 0,
        delete: 0,
        query: 0,
        total: 0,
        lastEventAt: null,
      });
    });
  });
});

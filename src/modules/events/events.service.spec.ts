import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { CreateEventEntity } from '../../database/entities/create-event.entity';
import { UpdateEventEntity } from '../../database/entities/update-event.entity';
import { DeleteEventEntity } from '../../database/entities/delete-event.entity';
import { QueryEventEntity } from '../../database/entities/query-event.entity';

type RepoMock = {
  create: jest.Mock;
  save: jest.Mock;
};

const buildRepoMock = (): RepoMock => ({
  create: jest.fn((data: object) => data),
  save: jest.fn((data: object) => Promise.resolve({ ...data, id: 1 })),
});

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
});

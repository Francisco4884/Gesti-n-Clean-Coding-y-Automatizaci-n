import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;

  const dataSourceMock = {
    query: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        {
          provide: DataSource,
          useValue: dataSourceMock,
        },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  it('ejecuta una consulta real contra SQLite antes de responder', async () => {
    dataSourceMock.query.mockResolvedValue([{ '1': 1 }]);

    await service.check();

    expect(dataSourceMock.query).toHaveBeenCalledTimes(1);
    expect(dataSourceMock.query).toHaveBeenCalledWith('SELECT 1');
  });

  it('responde ok cuando la consulta a SQLite tiene exito', async () => {
    dataSourceMock.query.mockResolvedValue([{ '1': 1 }]);

    const result = await service.check();

    expect(result.status).toBe('ok');
    expect(result.timestamp).toBeDefined();
  });

  it('responde 503 con status error cuando la consulta a SQLite falla', async () => {
    dataSourceMock.query.mockRejectedValue(new Error('database is locked'));

    expect.assertions(3);

    try {
      await service.check();
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.SERVICE_UNAVAILABLE,
      );
      expect((error as HttpException).getResponse()).toEqual({
        status: 'error',
      });
    }
  });
});

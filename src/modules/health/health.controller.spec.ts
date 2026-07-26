import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;

  const healthServiceMock = {
    check: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthService,
          useValue: healthServiceMock,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('delega la verificacion en HealthService', async () => {
    const respuesta = { status: 'ok', timestamp: '25/7/2026, 20:30:15' };
    healthServiceMock.check.mockResolvedValue(respuesta);

    await expect(controller.check()).resolves.toEqual(respuesta);
    expect(healthServiceMock.check).toHaveBeenCalledTimes(1);
  });
});

import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { HealthDetailDto } from './dto';

describe('HealthController', () => {
  let controller: HealthController;
  let healthService: DeepMocked<HealthService>;

  const allUp: HealthDetailDto = {
    status: 'UP',
    database: { status: 'UP', responseTimeMs: 2 },
    redis: { status: 'UP', responseTimeMs: 1 },
    bullmq: { status: 'UP', responseTimeMs: 3 },
  };

  const dbDown: HealthDetailDto = {
    status: 'DOWN',
    database: { status: 'DOWN', error: 'Connection refused' },
    redis: { status: 'UP', responseTimeMs: 1 },
    bullmq: { status: 'UP', responseTimeMs: 3 },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthService,
          useValue: createMock<HealthService>(),
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    healthService = module.get(HealthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('live', () => {
    it('should return status UP without calling any service', () => {
      const result = controller.live();

      expect(result).toEqual({ status: 'UP' });
      expect(healthService.getReadiness).not.toHaveBeenCalled();
    });
  });

  describe('ready', () => {
    it('should return 200 with full detail when all dependencies are UP', async () => {
      healthService.getReadiness.mockResolvedValue(allUp);

      const result = await controller.ready();

      expect(result).toEqual(allUp);
    });

    it('should throw HttpException 503 when any dependency is DOWN', async () => {
      healthService.getReadiness.mockResolvedValue(dbDown);

      await expect(controller.ready()).rejects.toThrow(HttpException);
    });

    it('should include component details in the 503 response body', async () => {
      healthService.getReadiness.mockResolvedValue(dbDown);

      try {
        await controller.ready();
        fail('Expected HttpException to be thrown');
      } catch (err) {
        const ex = err as HttpException;
        expect(ex.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
        const body = ex.getResponse() as HealthDetailDto;
        expect(body.status).toBe('DOWN');
        expect(body.database.status).toBe('DOWN');
        expect(body.database.error).toBe('Connection refused');
        expect(body.redis.status).toBe('UP');
      }
    });

    it('should call healthService.getReadiness once per request', async () => {
      healthService.getReadiness.mockResolvedValue(allUp);

      await controller.ready();

      expect(healthService.getReadiness).toHaveBeenCalledTimes(1);
    });
  });
});

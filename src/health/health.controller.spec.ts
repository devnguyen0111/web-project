import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;
  let healthService: {
    getLiveness: jest.Mock;
    getReadiness: jest.Mock;
  };

  beforeEach(() => {
    healthService = {
      getLiveness: jest.fn(),
      getReadiness: jest.fn(),
    };
    controller = new HealthController(
      healthService as unknown as HealthService,
    );
  });

  it('returns liveness payload', () => {
    const payload = {
      status: 'ok',
      service: 'web-project-api',
      timestamp: new Date().toISOString(),
    };
    healthService.getLiveness.mockReturnValue(payload);

    expect(controller.getLiveness()).toBe(payload);
  });

  it('returns readiness payload when status is ok', async () => {
    const payload = {
      status: 'ok',
      service: 'web-project-api',
      timestamp: new Date().toISOString(),
      checks: {
        mongodb: 'ok',
        payosConfig: 'ok',
        appConfig: 'ok',
      },
    };
    healthService.getReadiness.mockResolvedValue(payload);

    await expect(controller.getReadiness()).resolves.toEqual(payload);
  });

  it('throws 503 when readiness is degraded', async () => {
    healthService.getReadiness.mockResolvedValue({
      status: 'degraded',
      service: 'web-project-api',
      timestamp: new Date().toISOString(),
      checks: {
        mongodb: 'ok',
        payosConfig: 'degraded',
        appConfig: 'ok',
      },
    });

    await expect(controller.getReadiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});

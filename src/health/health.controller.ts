import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    const dbHealthy = await this.prisma.healthCheck();

    return {
      status: dbHealthy ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      database: dbHealthy ? 'connected' : 'disconnected',
    };
  }

  @Get('db')
  async checkDatabase() {
    const isHealthy = await this.prisma.healthCheck();

    return {
      database: {
        status: isHealthy ? 'up' : 'down',
        timestamp: new Date().toISOString(),
      },
    };
  }
}
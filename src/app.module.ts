import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { EventsModule } from './modules/events/events.module';
import { HealthModule } from './modules/health/health.module';
import { StatsModule } from './modules/stats/stats.module';

@Module({
  imports: [DatabaseModule, EventsModule, HealthModule, StatsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

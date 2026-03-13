import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityLog } from './activity-log.entity';
import { ActivityLogService } from './activity-log.service';
import { ActivityGateway } from './activity.gateway';
import { ActivityController } from './activity.controller';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([ActivityLog])],
  controllers: [ActivityController],
  providers: [ActivityLogService, ActivityGateway],
  exports: [ActivityLogService],
})
export class ActivityModule {}

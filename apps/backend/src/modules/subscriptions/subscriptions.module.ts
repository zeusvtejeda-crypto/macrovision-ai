import { Module } from '@nestjs/common';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { EmailService } from '@common/services/email.service';

@Module({
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, EmailService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}

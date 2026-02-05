import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MailTestController } from './controllers/mail-test.controller';
import { MailConsumerService } from './services/mail-consumer.service';
import { MailService } from './services/mail.service';

@Global()
@Module({
  imports: [
    BullModule.registerQueue({
      name: 'mail-queue',
    }),
  ],
  controllers: [MailTestController],
  providers: [MailService, MailConsumerService],
  exports: [MailService],
})
export class MailModule {}

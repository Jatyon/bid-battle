import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MailConsumerService } from './mail-consumer.service';
import { MailTestController } from './mail-test.controller';
import { MailService } from './mail.service';

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

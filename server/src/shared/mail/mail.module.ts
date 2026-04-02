import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MailConsumerService } from './mail-consumer.service';
import { MailTestController } from './mail-test.controller';
import { MAIL_QUEUE } from './mail.constants';
import { MailService } from './mail.service';

@Global()
@Module({
  imports: [
    BullModule.registerQueue({
      name: MAIL_QUEUE,
    }),
  ],
  controllers: [MailTestController],
  providers: [MailService, MailConsumerService],
  exports: [MailService],
})
export class MailModule {}

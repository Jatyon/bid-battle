import { Controller, Post, Body } from '@nestjs/common';
import { MailService } from '@modules/mail/services/mail.service';
import { TestMailDto } from '@modules/mail/dto/test-mail.dto';

@Controller('mail-test')
export class MailTestController {
  constructor(private readonly mailService: MailService) {}

  @Post('test')
  async sendTestEmail(@Body() body: TestMailDto) {
    const lang: string = body.lang ? body.lang : 'en';

    await this.mailService.sendTestEmail(body.email, lang);
    return { message: 'Email has been sent' };
  }
}

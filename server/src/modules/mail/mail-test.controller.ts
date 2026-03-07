import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ApiStandardResponse } from '@core/decorators/api-standard-response.decorator';
import { Public } from '@core/decorators/public.decorator';
import { MessageResponse } from '@core/models/message-response.model';
import { MailService } from './mail.service';
import { TestMailDto } from './dto';

@ApiTags('Mail Testing')
@Controller('mail-test')
export class MailTestController {
  constructor(private readonly mailService: MailService) {}

  @ApiOperation({
    summary: 'Send test email',
    description: 'Send a test email to verify mail configuration',
  })
  @ApiStandardResponse(MessageResponse, false)
  @Public()
  @Post('test')
  async sendTestEmail(@Body() body: TestMailDto): Promise<MessageResponse> {
    const lang: string = body.lang ? body.lang : 'en';

    await this.mailService.sendTestEmail(body.email, lang);
    return { message: 'Email has been sent' };
  }
}

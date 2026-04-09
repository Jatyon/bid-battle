import { Controller, Post, Body, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ApiStandardResponse, Public } from '@core/decorators';
import { MessageResponse } from '@core/models';
import { Language } from '@core/enums';
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
  @HttpCode(200)
  @Post('test')
  async sendTestEmail(@Body() body: TestMailDto): Promise<MessageResponse> {
    const lang: string = body.lang ? body.lang : Language.EN;

    await this.mailService.sendTestEmail(body.email, lang);
    return { message: 'Email has been sent' };
  }
}

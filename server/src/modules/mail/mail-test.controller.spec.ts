import { Test, TestingModule } from '@nestjs/testing';
import { MailTestController } from './mail-test.controller';
import { MailService } from './mail.service';
import { TestMailDto } from './dto';
import { createMock, DeepMocked } from '@golevelup/ts-jest';

describe('MailTestController', () => {
  let controller: MailTestController;
  let mailService: DeepMocked<MailService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MailTestController],
      providers: [
        {
          provide: MailService,
          useValue: createMock<MailService>(),
        },
      ],
    }).compile();

    controller = module.get<MailTestController>(MailTestController);
    mailService = module.get(MailService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('sendTestEmail', () => {
    const testEmailDto: TestMailDto = {
      email: 'test@example.com',
      lang: 'pl',
    };

    it('should call mailService.sendTestEmail with provided lang', async () => {
      mailService.sendTestEmail.mockResolvedValue(undefined);

      const result = await controller.sendTestEmail(testEmailDto);

      expect(mailService.sendTestEmail).toHaveBeenCalledWith(testEmailDto.email, testEmailDto.lang);
      expect(result).toEqual({ message: 'Email has been sent' });
    });

    it('should fallback to default language "en" if lang is not provided', async () => {
      const dtoWithoutLang = { email: 'test@example.com' } as TestMailDto;
      mailService.sendTestEmail.mockResolvedValue(undefined);

      await controller.sendTestEmail(dtoWithoutLang);

      expect(mailService.sendTestEmail).toHaveBeenCalledWith(dtoWithoutLang.email, 'en');
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { AppConfigService } from '@config/config.service';
import { createMockI18nService } from '@test/mocks/i18n.mock';
import { MailService } from './mail.service';
import { IMailContext } from './interfaces';
import { JobName } from './enums';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { I18nService } from 'nestjs-i18n';
import { Queue } from 'bullmq';

describe('MailService', () => {
  let service: MailService;
  let mailQueue: DeepMocked<Queue>;
  let i18nService: DeepMocked<I18nService>;

  const mockConfig = {
    app: {
      name: 'TestApp',
      frontendHost: 'http://localhost:3000',
    },
  };

  beforeEach(async () => {
    i18nService = createMockI18nService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        {
          provide: AppConfigService,
          useValue: createMock<AppConfigService>(mockConfig),
        },
        {
          provide: I18nService,
          useValue: i18nService,
        },
        {
          provide: getQueueToken('mail-queue'),
          useValue: createMock<Queue>(),
        },
      ],
    }).compile();

    service = module.get<MailService>(MailService);
    mailQueue = module.get(getQueueToken('mail-queue'));
  });

  describe('sendTestEmail', () => {
    it('should correctly process translations and add job to queue', async () => {
      const email = 'user@example.com';
      const lang = 'en';
      const context: IMailContext = {
        appName: mockConfig.app.name,
        appUrl: mockConfig.app.frontendHost,
        footer: { rights: 'translated_mail.footer.rights' },
      };

      jest.spyOn(i18nService, 't').mockImplementation((key: string) => `translated_${key}`);

      await service.sendTestEmail(email, lang);

      expect(mailQueue.add).toHaveBeenCalledWith(
        JobName.CRITICAL_MAIL,
        expect.objectContaining({
          to: email,
          subject: 'translated_mail.subjects.test',
          template: `./${lang}/test`,
          context,
        }),
        expect.objectContaining({
          priority: 1,
          attempts: 3,
          backoff: 5000,
          removeOnComplete: true,
        }),
      );
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { AppConfigService } from '@config/config.service';
import { MailConsumerService } from './mail-consumer.service';
import { JobName } from './enums';
import { createMock } from '@golevelup/ts-jest';
import * as nodemailer from 'nodemailer';
import { Job } from 'bullmq';

jest.mock('nodemailer-express-handlebars', () => {
  return jest.fn(() => {
    return (_mail: unknown, callback: () => void): void => callback();
  });
});
jest.mock('nodemailer');

const mockSendMail = jest.fn();
const mockUse = jest.fn();
const mockVerify = jest.fn((callback: (err: Error | null) => void) => callback(null));

(nodemailer.createTransport as jest.Mock).mockReturnValue({
  sendMail: mockSendMail,
  use: mockUse,
  verify: mockVerify,
});

describe('MailConsumerService', () => {
  let service: MailConsumerService;

  const mockConfig = {
    mailer: {
      from: { address: 'no-reply@test.com' },
      host: 'smtp.test.com',
      port: 587,
      auth: { user: 'user', pass: 'pass' },
    },
    app: {
      name: 'TestApp',
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailConsumerService,
        {
          provide: AppConfigService,
          useValue: createMock<AppConfigService>(mockConfig),
        },
      ],
    }).compile();

    service = module.get<MailConsumerService>(MailConsumerService);

    service.onModuleInit();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('process', () => {
    it('should process critical email job', async () => {
      const job = createMock<Job>({
        name: JobName.CRITICAL_MAIL,
        data: {
          to: 'client@test.com',
          subject: 'Critical Info',
          template: 'critical',
          context: {},
        },
      });

      mockSendMail.mockResolvedValueOnce({ messageId: '123' });

      await service.process(job);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'client@test.com',
          subject: 'Critical Info',
        }),
      );
    });

    it('should process bulk email job with delay', async () => {
      const job = createMock<Job>({
        name: JobName.BULK_MAIL,
        data: {
          to: 'newsletter@test.com',
          subject: 'Newsletter',
          template: 'bulk',
          context: {},
        },
      });

      mockSendMail.mockResolvedValueOnce({ messageId: '456' });

      await service.process(job);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'newsletter@test.com',
        }),
      );
    });

    it('should log a warning for unknown job names', async () => {
      const job = createMock<Job>({
        name: 'unknown-job' as unknown as JobName,
      });

      const loggerSpy = jest.spyOn(service['logger'] as unknown as Logger, 'warn');

      await service.process(job);

      expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown job name'));
      expect(mockSendMail).not.toHaveBeenCalled();
    });
  });

  describe('sendEmail error handling', () => {
    it('should throw and log error when transporter fails', async () => {
      const job = createMock<Job>({
        name: JobName.CRITICAL_MAIL,
        data: { to: 'fail@test.com' },
      });

      const error = new Error('SMTP Error');
      mockSendMail.mockRejectedValueOnce(error);

      const loggerSpy = jest.spyOn(service['logger'] as unknown as Logger, 'error').mockImplementation(() => {});

      await expect(service.process(job)).rejects.toThrow('SMTP Error');
      expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to send email'));

      loggerSpy.mockRestore();
    });
  });
});

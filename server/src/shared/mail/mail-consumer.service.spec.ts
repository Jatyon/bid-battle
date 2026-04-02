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
      secure: true,
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

  describe('onWorkerFailed', () => {
    let errorSpy: jest.SpyInstance;
    let warnSpy: jest.SpyInstance;

    beforeEach(() => {
      errorSpy = jest.spyOn(service['logger'] as unknown as Logger, 'error').mockImplementation(() => {});
      warnSpy = jest.spyOn(service['logger'] as unknown as Logger, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it('should log ERROR with [DLQ] prefix when all attempts are exhausted', () => {
      const job = createMock<Job<any>>({
        id: 'job-1',
        name: JobName.CRITICAL_MAIL,
        attemptsMade: 3,
        opts: { attempts: 3 },
        data: { to: 'user@test.com', subject: 'Verify email' },
      });
      const error = new Error('SMTP timeout');

      service.onWorkerFailed(job, error);

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[DLQ]'), error.stack);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('permanently failed after 3 attempt(s)'), error.stack);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('user@test.com'), error.stack);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('should log WARN with [RETRY] prefix on intermediate failures', () => {
      const job = createMock<Job<any>>({
        id: 'job-2',
        name: JobName.CRITICAL_MAIL,
        attemptsMade: 1,
        opts: { attempts: 3 },
        data: { to: 'user@test.com', subject: 'Reset password' },
      });
      const error = new Error('Connection refused');

      service.onWorkerFailed(job, error);

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[RETRY]'));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('attempt 1/3'));
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('should log ERROR with [DLQ] prefix when job is undefined', () => {
      const error = new Error('No job context');

      service.onWorkerFailed(undefined, error);

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[DLQ]'), error.stack);
    });

    it('should treat missing opts.attempts as 1 and log DLQ on first failure', () => {
      const job = createMock<Job<any>>({
        id: 'job-3',
        name: JobName.BULK_MAIL,
        attemptsMade: 1,
        opts: {},
        data: { to: 'bulk@test.com', subject: 'Newsletter' },
      });
      const error = new Error('Rate limited');

      service.onWorkerFailed(job, error);

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[DLQ]'), error.stack);
    });
  });
});

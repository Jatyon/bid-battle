import { createMockFilesFixture } from '@test/fixtures/file.fixtures';
import { AppConfigService } from '@config/config.service';
import { LocalStorageStrategy } from './local-storage.strategy';
import { createMock } from '@golevelup/ts-jest';
import { promises as fs } from 'fs';
import { normalize } from 'path';

jest.mock('path', () => {
  const actualPath = jest.requireActual<typeof import('path')>('path');
  return {
    ...actualPath,
    resolve: jest.fn((...args: string[]) => actualPath.posix.resolve(...args)),
    normalize: jest.fn((p: string): string => actualPath.posix.normalize(p)),
    dirname: jest.fn((p: string): string => actualPath.posix.dirname(p)),
    sep: '/',
  };
});

jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    writeFile: jest.fn(),
    unlink: jest.fn(),
  },
}));

const mockMkdir = jest.mocked(fs.mkdir);
const mockWriteFile = jest.mocked(fs.writeFile);
const mockUnlink = jest.mocked(fs.unlink);

describe('LocalStorageStrategy', () => {
  let strategy: LocalStorageStrategy;
  let mockConfigService: AppConfigService;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfigService = createMock<AppConfigService>({
      file: { uploadsDir: '/mock/uploads/dir' },
      app: { publicUrl: 'http://localhost:3000' },
    });

    strategy = new LocalStorageStrategy(mockConfigService);
  });

  describe('upload', () => {
    it('should create directory recursively and write file buffer', async () => {
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const [file] = createMockFilesFixture(1);
      const fileKey = '2026/03/auctions/abc123.jpg';
      const expectedAbsolutePath = '/mock/uploads/dir/2026/03/auctions/abc123.jpg';

      await strategy.upload(file, fileKey);

      expect(mockMkdir).toHaveBeenCalledWith('/mock/uploads/dir/2026/03/auctions', { recursive: true });
      expect(mockWriteFile).toHaveBeenCalledWith(expectedAbsolutePath, file.buffer);
    });

    it('should return correct public url and file key path on success', async () => {
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const [file] = createMockFilesFixture(1);
      const fileKey = '2026/03/auctions/abc123.jpg';

      const result = await strategy.upload(file, fileKey);

      expect(result.path).toBe(fileKey);
      expect(result.url).toBe('http://localhost:3000/uploads/2026/03/auctions/abc123.jpg');
    });

    it('should strip trailing slash from publicUrl before appending fileKey', async () => {
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      mockConfigService = createMock<AppConfigService>({
        file: { uploadsDir: '/mock/uploads/dir' },
        app: { publicUrl: 'https://api.domain.com/' },
      });
      strategy = new LocalStorageStrategy(mockConfigService);

      const [file] = createMockFilesFixture(1);
      const fileKey = 'avatars/xyz.png';

      const result = await strategy.upload(file, fileKey);

      expect(result.url).toBe('https://api.domain.com/uploads/avatars/xyz.png');
    });

    it('should propagate error when mkdir fails', async () => {
      mockMkdir.mockRejectedValue(new Error('Permission denied'));

      const [file] = createMockFilesFixture(1);

      await expect(strategy.upload(file, 'abc.jpg')).rejects.toThrow('Permission denied');
      expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it('should propagate error when writeFile fails', async () => {
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockRejectedValue(new Error('Disk full'));

      const [file] = createMockFilesFixture(1);

      await expect(strategy.upload(file, 'abc.jpg')).rejects.toThrow('Disk full');
    });
  });

  describe('delete', () => {
    it('should call fs.unlink with the absolute path', async () => {
      mockUnlink.mockResolvedValue(undefined);

      const fileKey = '2026/03/auctions/abc123.jpg';
      const expectedAbsolutePath = '/mock/uploads/dir/2026/03/auctions/abc123.jpg';

      await strategy.delete(fileKey);

      expect(mockUnlink).toHaveBeenCalledWith(expectedAbsolutePath);
    });

    it('should throw SECURITY ALERT when path contains ".." escaping uploads directory', async () => {
      const maliciousKey = '../../etc/passwd';

      await expect(strategy.delete(maliciousKey)).rejects.toThrow('SECURITY ALERT: Path traversal attempt blocked!');
      expect(mockUnlink).not.toHaveBeenCalled();
    });

    it('should throw Unsafe path rejected if normalized path differs', async () => {
      jest.mocked(normalize).mockReturnValueOnce('/different/path/entirely.jpg');

      const fileKey = '2026/03/auctions/abc.jpg';

      await expect(strategy.delete(fileKey)).rejects.toThrow('Unsafe path rejected');
      expect(mockUnlink).not.toHaveBeenCalled();
    });

    it('should propagate error when fs.unlink fails', async () => {
      mockUnlink.mockRejectedValue(new Error('File not found'));

      await expect(strategy.delete('2026/03/auctions/abc.jpg')).rejects.toThrow('File not found');
    });

    it('should accept a valid fileKey without throwing', async () => {
      mockUnlink.mockResolvedValue(undefined);

      await expect(strategy.delete('2026/03/auctions/safe.jpg')).resolves.not.toThrow();
      expect(mockUnlink).toHaveBeenCalledTimes(1);
    });
  });
});

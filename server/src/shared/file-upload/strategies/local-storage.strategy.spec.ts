import { createMockFilesFixture } from '@test/fixtures/file.fixtures';
import { LocalStorageStrategy } from './local-storage.strategy';
import { normalize, posix } from 'path';
import { promises as fs } from 'fs';

jest.mock('path', () => {
  const actualPath = jest.requireActual<typeof import('path')>('path');
  return {
    ...actualPath,
    normalize: jest.fn((p: string): string => posix.normalize(p)),
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

  beforeEach(() => {
    jest.clearAllMocks();
    strategy = new LocalStorageStrategy();
  });

  describe('upload', () => {
    it('should create directory recursively and write file buffer', async () => {
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const [file] = createMockFilesFixture(1);
      const path = '/uploads/2026/03/auctions/abc123.jpg';

      await strategy.upload(file, path);

      expect(mockMkdir).toHaveBeenCalledWith('/uploads/2026/03/auctions', { recursive: true });
      expect(mockWriteFile).toHaveBeenCalledWith(path, file.buffer);
    });

    it('should return correct url and path on success', async () => {
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const [file] = createMockFilesFixture(1);
      const path = '/uploads/2026/03/auctions/abc123.jpg';

      const result = await strategy.upload(file, path);

      expect(result.path).toBe(path);
      expect(result.url).toBe('/uploads/2026/03/auctions/abc123.jpg');
    });

    it('should return url equal to path when path already starts with /uploads', async () => {
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const [file] = createMockFilesFixture(1);
      const path = '/uploads/2026/03/avatars/xyz.png';

      const result = await strategy.upload(file, path);

      expect(result.url).toBe('/uploads/2026/03/avatars/xyz.png');
    });

    it('should propagate error when mkdir fails', async () => {
      mockMkdir.mockRejectedValue(new Error('Permission denied'));

      const [file] = createMockFilesFixture(1);

      await expect(strategy.upload(file, '/uploads/abc.jpg')).rejects.toThrow('Permission denied');

      expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it('should propagate error when writeFile fails', async () => {
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockRejectedValue(new Error('Disk full'));

      const [file] = createMockFilesFixture(1);

      await expect(strategy.upload(file, '/uploads/abc.jpg')).rejects.toThrow('Disk full');
    });
  });

  describe('delete', () => {
    it('should call fs.unlink with the normalized absolute path', async () => {
      mockUnlink.mockResolvedValue(undefined);

      const absolutePath = '/uploads/2026/03/auctions/abc123.jpg';
      await strategy.delete(absolutePath);

      expect(mockUnlink).toHaveBeenCalledWith(normalize(absolutePath));
    });

    it('should propagate error when fs.unlink fails', async () => {
      mockUnlink.mockRejectedValue(new Error('File not found'));

      await expect(strategy.delete('/uploads/2026/03/auctions/abc.jpg')).rejects.toThrow('File not found');
    });

    it('should throw when path contains ".." traversal segments', async () => {
      await expect(strategy.delete('/uploads/../etc/passwd')).rejects.toThrow('Unsafe path rejected');

      expect(mockUnlink).not.toHaveBeenCalled();
    });

    it('should throw when path contains "." current-dir segments', async () => {
      await expect(strategy.delete('/uploads/./auctions/abc.jpg')).rejects.toThrow('Unsafe path rejected');

      expect(mockUnlink).not.toHaveBeenCalled();
    });

    it('should throw when path is relative (no leading separator)', async () => {
      await expect(strategy.delete('uploads/auctions/abc.jpg')).rejects.toThrow('Non-absolute path rejected');

      expect(mockUnlink).not.toHaveBeenCalled();
    });

    it(`should throw for path that is just ".."`, async () => {
      await expect(strategy.delete('..')).rejects.toThrow();

      expect(mockUnlink).not.toHaveBeenCalled();
    });

    it('should accept a valid absolute path without throwing', async () => {
      mockUnlink.mockResolvedValue(undefined);

      await expect(strategy.delete('/uploads/2026/03/auctions/safe.jpg')).resolves.not.toThrow();

      expect(mockUnlink).toHaveBeenCalledTimes(1);
    });

    it('should throw for path with redundant slashes (differs after normalization)', async () => {
      await expect(strategy.delete('/uploads//auctions//abc.jpg')).rejects.toThrow('Unsafe path rejected');

      expect(mockUnlink).not.toHaveBeenCalled();
    });
  });
});

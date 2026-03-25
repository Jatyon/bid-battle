export const createMockFilesFixture = (count = 1): Express.Multer.File[] => {
  return Array.from({ length: count }, (_, i) => ({
    fieldname: 'images',
    originalname: `test${i + 1}.jpg`,
    encoding: '7bit',
    mimetype: 'image/jpeg',
    size: 12345,
    destination: '/tmp',
    filename: `test${i + 1}.jpg`,
    path: `/tmp/test${i + 1}.jpg`,
    buffer: Buffer.from(''),
  })) as Express.Multer.File[];
};

import { Auction, AuctionDetailResponse, AuctionImage, AuctionResponse, AuctionStatus, CreateAuctionDto, UpdateAuctionDto } from '@modules/auctions';
import { createUserFixture } from './users.fixtures';

export const createAuctionFixture = (overrides?: Partial<Auction>): Auction => ({
  id: 1,
  title: 'Test Auction',
  description: 'Test Description',
  startingPrice: 100,
  currentPrice: 100,
  endTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
  ownerId: 1,
  status: AuctionStatus.ACTIVE,
  mainImageUrl: '/uploads/image1.jpg',
  images: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  owner: createUserFixture(),
  ...overrides,
});

export const createAuctionImageFixture = (overrides?: Partial<AuctionImage>): AuctionImage => {
  const auction = overrides?.auction || createAuctionFixture();
  return {
    id: 1,
    imageUrl: '/uploads/existing.jpg',
    isPrimary: true,
    auctionId: auction.id,
    auction,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
};

export const createCreateAuctionDtoFixture = (overrides?: Partial<CreateAuctionDto>): CreateAuctionDto => ({
  title: 'Test Auction',
  description: 'Test Description',
  startingPrice: 100,
  endTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
  imageUrls: ['/uploads/image1.jpg', '/uploads/image2.jpg'],
  primaryImageIndex: 0,
  ...overrides,
});

export const createUpdateAuctionDtoFixture = (overrides?: Partial<UpdateAuctionDto>): UpdateAuctionDto => ({
  title: 'Updated Title',
  description: 'Updated Description',
  endTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
  ...overrides,
});

export const createAuctionResponseFixture = (overrides?: Partial<Auction>): AuctionResponse => {
  const auction = createAuctionFixture(overrides);
  return new AuctionResponse(auction);
};

export const createAuctionDetailResponseFixture = (overrides?: Partial<Auction>): AuctionDetailResponse => {
  const auction = createAuctionFixture({
    images: [{ imageUrl: '/uploads/image1.jpg', isPrimary: true } as AuctionImage],
    ...overrides,
  });
  return new AuctionDetailResponse(auction);
};

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

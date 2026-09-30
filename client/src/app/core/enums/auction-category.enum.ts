export const AUCTION_CATEGORIES = [
  'electronics',
  'fashion',
  'home_garden',
  'collectibles',
  'vehicles',
  'sports',
  'art',
  'books',
  'toys',
  'other',
] as const;

export type AuctionCategory = (typeof AUCTION_CATEGORIES)[number];

export function auctionCategoryTranslationKey(category: AuctionCategory): string {
  return `AUCTIONS.CATEGORIES.${category.toUpperCase()}`;
}

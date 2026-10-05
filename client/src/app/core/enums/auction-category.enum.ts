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

export interface CategorySelectOption {
  value: string;
  label: string;
}

export function buildCategorySelectOptions(
  transloco: { translate: (key: string) => string },
  allCategoriesLabelKey?: string,
): CategorySelectOption[] {
  const options: CategorySelectOption[] = [];

  if (allCategoriesLabelKey) {
    options.push({
      value: '',
      label: transloco.translate(allCategoriesLabelKey),
    });
  }

  for (const category of AUCTION_CATEGORIES) {
    options.push({
      value: category,
      label: transloco.translate(auctionCategoryTranslationKey(category)),
    });
  }

  return options;
}


import {
  AUCTION_CATEGORIES,
  auctionCategoryTranslationKey,
  buildCategorySelectOptions,
} from './auction-category.enum';

describe('AuctionCategory Enum & Utils', () => {
  describe('auctionCategoryTranslationKey', () => {
    it('should return correct translation key for electronics', () => {
      expect(auctionCategoryTranslationKey('electronics')).toBe('AUCTIONS.CATEGORIES.ELECTRONICS');
    });

    it('should return correct translation key for home_garden', () => {
      expect(auctionCategoryTranslationKey('home_garden')).toBe('AUCTIONS.CATEGORIES.HOME_GARDEN');
    });
  });

  describe('buildCategorySelectOptions', () => {
    const mockTransloco = {
      translate: (key: string) => `translated:${key}`,
    };

    it('should return category options without allCategories option if label key is omitted', () => {
      const result = buildCategorySelectOptions(mockTransloco);
      expect(result.length).toBe(AUCTION_CATEGORIES.length);
      expect(result[0]).toEqual({
        value: 'electronics',
        label: 'translated:AUCTIONS.CATEGORIES.ELECTRONICS',
      });
    });

    it('should include allCategories option as first item when allCategoriesLabelKey is provided', () => {
      const result = buildCategorySelectOptions(mockTransloco, 'ALL_CATS');
      expect(result.length).toBe(AUCTION_CATEGORIES.length + 1);
      expect(result[0]).toEqual({
        value: '',
        label: 'translated:ALL_CATS',
      });
      expect(result[1]).toEqual({
        value: 'electronics',
        label: 'translated:AUCTIONS.CATEGORIES.ELECTRONICS',
      });
    });
  });
});

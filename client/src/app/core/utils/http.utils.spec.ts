import { cleanParams, normalizePageParams } from './http.utils';

describe('http.utils', () => {
  describe('cleanParams', () => {
    it('returns empty object when input is undefined or null', () => {
      expect(cleanParams()).toEqual({});
      expect(cleanParams(null)).toEqual({});
    });

    it('filters out undefined, null, and empty string properties', () => {
      const input = {
        page: 1,
        limit: 10,
        search: '',
        status: undefined,
        category: null,
      };

      expect(cleanParams(input)).toEqual({
        page: 1,
        limit: 10,
      });
    });

    it('preserves falsy values like false and 0', () => {
      const input = {
        hasWinner: false,
        minPrice: 0,
        title: 'test',
      };

      expect(cleanParams(input)).toEqual({
        hasWinner: false,
        minPrice: 0,
        title: 'test',
      });
    });
  });

  describe('normalizePageParams', () => {
    it('normalizes number into page and limit', () => {
      expect(normalizePageParams(3, 20)).toEqual({ page: 3, limit: 20 });
      expect(normalizePageParams(2)).toEqual({ page: 2, limit: 10 });
    });

    it('defaults page to 1 and limit to 10 when called with filters or undefined', () => {
      expect(normalizePageParams()).toEqual({ page: 1, limit: 10 });
      expect(normalizePageParams({ search: 'camera' })).toEqual({
        page: 1,
        limit: 10,
        search: 'camera',
      });
    });

    it('preserves custom page and limit passed in filter object', () => {
      expect(normalizePageParams({ page: 4, limit: 25, search: 'laptop' })).toEqual({
        page: 4,
        limit: 25,
        search: 'laptop',
      });
    });
  });
});

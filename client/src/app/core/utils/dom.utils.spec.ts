import { scrollToTop } from './dom.utils';

describe('dom.utils', () => {
  describe('scrollToTop', () => {
    it('should call window.scrollTo with options', () => {
      const spy = vi.spyOn(window, 'scrollTo').mockImplementation(vi.fn());
      scrollToTop();
      expect(spy).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    });

    it('should fall back to window.scrollTo(0, 0) if scrollTo with options throws', () => {
      const spy = vi.spyOn(window, 'scrollTo').mockImplementation((options?: unknown) => {
        if (typeof options === 'object') {
          throw new TypeError('Failed to execute scrollTo');
        }
      });

      scrollToTop();
      expect(spy).toHaveBeenCalledWith(0, 0);
    });
  });
});

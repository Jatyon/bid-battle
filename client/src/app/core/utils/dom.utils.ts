/**
 * Safely scrolls the window to top (0, 0).
 * Handles SSR environment safety checks and provides fallback scrolling
 * if the browser environment does not support smooth scroll options.
 */
export function scrollToTop(behavior: ScrollBehavior = 'smooth'): void {
  if (typeof window === 'undefined') return;

  try {
    window.scrollTo({ top: 0, behavior });
  } catch {
    // Fallback for legacy browser engines/test runners that don't support ScrollToOptions
    window.scrollTo(0, 0);
  }
}

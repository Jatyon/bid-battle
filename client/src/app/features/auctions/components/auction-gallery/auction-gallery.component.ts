import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { resolveImageUrl } from '@core/utils';
import { TranslocoDirective } from '@jsverse/transloco';
import { ChevronLeft, ChevronRight, Download, LucideAngularModule, X } from 'lucide-angular';

@Component({
  selector: 'app-auction-gallery',
  standalone: true,
  imports: [LucideAngularModule, TranslocoDirective],
  templateUrl: './auction-gallery.component.html',
  styleUrl: './auction-gallery.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuctionGalleryComponent {
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly destroyRef = inject(DestroyRef);

  readonly images = input<string[]>([]);
  readonly mainImageUrl = input<string>('');

  readonly selectedIndex = signal<number>(0);
  readonly isLightboxOpen = signal<boolean>(false);
  readonly lightboxIndex = signal<number>(0);

  readonly downloadIcon = Download;
  readonly closeIcon = X;
  readonly prevIcon = ChevronLeft;
  readonly nextIcon = ChevronRight;

  readonly allImages = computed(() => {
    const list = this.images();
    const main = this.mainImageUrl();

    if (!list || list.length === 0) return main ? [main] : [];
    return list;
  });

  readonly activeImageUrl = computed(() => {
    const imgs = this.allImages();
    const idx = this.selectedIndex();

    if (imgs.length > 0 && idx >= 0 && idx < imgs.length) return this.imageUrl(imgs[idx]);

    return this.mainImageUrl()
      ? this.imageUrl(this.mainImageUrl())
      : 'assets/images/placeholder.svg';
  });

  readonly lightboxActiveUrl = computed(() => {
    const imgs = this.allImages();
    const idx = this.lightboxIndex();

    if (imgs.length > 0 && idx >= 0 && idx < imgs.length) return this.imageUrl(imgs[idx]);

    return this.activeImageUrl();
  });

  constructor() {
    effect(() => {
      if (!this.isBrowser) return;
      this.document.body.style.overflow = this.isLightboxOpen() ? 'hidden' : '';
    });

    this.destroyRef.onDestroy(() => {
      if (this.isBrowser) this.document.body.style.overflow = '';
    });
  }

  selectImage(index: number): void {
    this.selectedIndex.set(index);
  }

  openLightbox(index?: number): void {
    const idx = index !== undefined ? index : this.selectedIndex();
    this.lightboxIndex.set(idx);
    this.isLightboxOpen.set(true);
  }

  closeLightbox(): void {
    this.isLightboxOpen.set(false);
  }

  onBackdropClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (
      event.target === event.currentTarget ||
      target?.classList.contains('lightbox-stage') ||
      target?.classList.contains('dark-overlay') ||
      target?.classList.contains('blurred-bg')
    ) {
      this.closeLightbox();
    }
  }

  nextLightboxImage(): void {
    const total = this.allImages().length;
    if (total === 0) return;
    this.lightboxIndex.update((current) => (current + 1) % total);
  }

  prevLightboxImage(): void {
    const total = this.allImages().length;

    if (total === 0) return;
    this.lightboxIndex.update((current) => (current - 1 + total) % total);
  }

  downloadImage(): void {
    if (!this.isBrowser) return;

    const url = this.lightboxActiveUrl();
    if (!url) return;

    const a = this.document.createElement('a');
    a.href = url;
    a.download = `auction-photo-${this.lightboxIndex() + 1}.jpg`;
    a.target = '_blank';
    this.document.body.appendChild(a);
    a.click();
    this.document.body.removeChild(a);
  }

  imageUrl(value: string): string {
    return resolveImageUrl(value, this.document.baseURI);
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent): void {
    if (!this.isLightboxOpen()) return;

    if (event.key === 'Escape') return this.closeLightbox();
    if (event.key === 'ArrowRight') return this.nextLightboxImage();
    if (event.key === 'ArrowLeft') return this.prevLightboxImage();
  }
}

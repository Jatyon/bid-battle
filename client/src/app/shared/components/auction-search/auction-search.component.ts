import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CurrencyPipe, NgTemplateOutlet } from '@angular/common';
import { TranslocoDirective } from '@jsverse/transloco';
import { LucideAngularModule, Search, X } from 'lucide-angular';

interface MockAuctionSearchResult {
  id: number;
  title: string;
  category: string;
  imageUrl: string;
  currentPrice: number;
  bidsCount: number;
}

// Mirrors the public auction response fields returned by GET /auctions.
const MOCK_AUCTIONS: MockAuctionSearchResult[] = [
  {
    id: 101,
    title: 'Aparat fotograficzny Canon EOS',
    category: 'ELECTRONICS',
    imageUrl:
      'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=160&q=80',
    currentPrice: 184900,
    bidsCount: 12,
  },
  {
    id: 102,
    title: 'Zegarek vintage automatyczny',
    category: 'COLLECTIBLES',
    imageUrl:
      'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=160&q=80',
    currentPrice: 72500,
    bidsCount: 8,
  },
  {
    id: 103,
    title: 'Słuchawki bezprzewodowe',
    category: 'ELECTRONICS',
    imageUrl:
      'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=160&q=80',
    currentPrice: 36900,
    bidsCount: 5,
  },
  {
    id: 104,
    title: 'Buty sportowe — edycja limitowana',
    category: 'FASHION',
    imageUrl:
      'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=160&q=80',
    currentPrice: 21900,
    bidsCount: 3,
  },
  {
    id: 105,
    title: 'Lampa stołowa w stylu retro',
    category: 'HOME_GARDEN',
    imageUrl:
      'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=160&q=80',
    currentPrice: 14500,
    bidsCount: 2,
  },
];

@Component({
  selector: 'app-auction-search',
  imports: [CurrencyPipe, NgTemplateOutlet, LucideAngularModule, TranslocoDirective],
  templateUrl: './auction-search.component.html',
  styleUrl: './auction-search.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuctionSearchComponent {
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  @ViewChild('mobileSearchInput') private mobileSearchInput?: ElementRef<HTMLInputElement>;

  readonly searchIcon = Search;
  readonly clearIcon = X;
  readonly query = signal('');
  readonly isOpen = signal(false);
  readonly isMobileSearchOpen = signal(false);
  readonly mockResults = MOCK_AUCTIONS;
  readonly results = computed(() => {
    const query = this.query().trim().toLocaleLowerCase();
    if (!query) return this.mockResults.slice(0, 4);

    return this.mockResults
      .filter((auction) => auction.title.toLocaleLowerCase().includes(query))
      .slice(0, 5);
  });

  onInput(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;

    this.query.set(target.value);
    this.isOpen.set(true);
  }

  openResults(): void {
    this.isOpen.set(true);
  }

  openMobileSearch(): void {
    this.isMobileSearchOpen.set(true);
    this.isOpen.set(true);
    setTimeout(() => this.mobileSearchInput?.nativeElement.focus());
  }

  closeMobileSearch(): void {
    this.isMobileSearchOpen.set(false);
    this.isOpen.set(false);
  }

  closeFromBackdrop(event: Event): void {
    if (event.target === event.currentTarget) this.closeMobileSearch();
  }

  selectResult(auction: MockAuctionSearchResult): void {
    this.query.set(auction.title);
    this.isOpen.set(false);
    this.isMobileSearchOpen.set(false);
  }

  clearSearch(input: HTMLInputElement): void {
    this.query.set('');
    input.value = '';
    this.isOpen.set(true);
    input.focus();
  }

  closeResults(): void {
    this.isOpen.set(false);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      if (this.isMobileSearchOpen()) this.closeMobileSearch();
      else this.closeResults();
      return;
    }

    if (event.key === 'Enter' && this.results().length) {
      event.preventDefault();
      this.selectResult(this.results()[0]);
    }
  }

  @HostListener('document:click', ['$event.target'])
  onDocumentClick(target: EventTarget | null): void {
    if (target instanceof Node && !this.elementRef.nativeElement.contains(target)) {
      this.closeResults();
    }
  }
}

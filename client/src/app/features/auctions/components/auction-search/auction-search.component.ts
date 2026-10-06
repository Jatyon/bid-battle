import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PricePipe } from '@app/shared';
import { auctionCategoryTranslationKey } from '@core/enums';
import { SortOrder } from '@core/enums';
import { AuctionsService } from '@features/auctions/services/auctions.service';
import { Auction } from '@features/auctions/models/auction.model';
import { AuctionSortBy } from '@features/auctions/enums';
import { TranslocoDirective } from '@jsverse/transloco';
import { Router } from '@angular/router';
import { Subject, catchError, debounceTime, distinctUntilChanged, map, of, switchMap, tap } from 'rxjs';
import { LucideAngularModule, Search, X } from 'lucide-angular';

@Component({
  selector: 'app-auction-search',
  imports: [PricePipe, NgTemplateOutlet, LucideAngularModule, TranslocoDirective],
  templateUrl: './auction-search.component.html',
  styleUrl: './auction-search.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuctionSearchComponent {
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly auctionsService = inject(AuctionsService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  @ViewChild('mobileSearchInput') private mobileSearchInput?: ElementRef<HTMLInputElement>;
  private readonly searchRequests = new Subject<string>();
  private hasLoadedFeatured = false;

  readonly searchIcon = Search;
  readonly clearIcon = X;
  readonly query = signal('');
  readonly isOpen = signal(false);
  readonly isMobileSearchOpen = signal(false);
  readonly results = signal<Auction[]>([]);
  readonly isLoading = signal(false);
  readonly hasError = signal(false);
  readonly categoryTranslationKey = auctionCategoryTranslationKey;

  constructor() {
    this.searchRequests
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        tap(() => {
          this.results.set([]);
          this.isLoading.set(true);
          this.hasError.set(false);
        }),
        switchMap((search) =>
          this.auctionsService
            .getActiveAuctions({
              page: 1,
              limit: 12,
              search: search || undefined,
              sortBy: AuctionSortBy.CREATED_AT,
              sortOrder: SortOrder.DESC,
            })
            .pipe(
              map((response) => ({ response, search })),
              catchError(() => of({ response: null, search })),
            ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ response, search }) => {
        this.isLoading.set(false);
        if (!response) {
          this.results.set([]);
          this.hasError.set(true);
          return;
        }

        this.results.set(response.items.slice(0, 5));
        if (!search) this.hasLoadedFeatured = true;
      });
  }

  onInput(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;

    this.query.set(target.value);
    this.isOpen.set(true);
    this.searchRequests.next(target.value.trim());
  }

  openResults(): void {
    this.isOpen.set(true);
    if (!this.query().trim() && !this.hasLoadedFeatured && !this.isLoading())
      this.searchRequests.next('');
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

  selectResult(auction: Auction): void {
    this.query.set(auction.title);
    this.isOpen.set(false);
    this.isMobileSearchOpen.set(false);
    this.router.navigate(['/auctions', auction.id]);
  }

  clearSearch(input: HTMLInputElement): void {
    this.query.set('');
    input.value = '';
    this.isOpen.set(true);
    this.searchRequests.next('');
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

import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BadgeComponent, PaginationComponent } from '@app/shared';
import type { PaginatedResponse } from '@core/models';
import { scrollToTop } from '@core/utils';
import { SortOrder } from '@core/enums';
import { AuctionCardComponent, AuctionFiltersComponent } from '@features/auctions/components';
import { Auction, AuctionListFilters, AuctionSearchQuery } from '@features/auctions/models';
import { AuctionsService } from '@features/auctions/services';
import { AuctionSortBy } from '@features/auctions/enums';
import { TranslocoDirective } from '@jsverse/transloco';
import { EMPTY, Subject, catchError, finalize, switchMap } from 'rxjs';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-auction-list',
  imports: [
    TranslocoDirective,
    LucideAngularModule,
    AuctionCardComponent,
    AuctionFiltersComponent,
    BadgeComponent,
    PaginationComponent,
  ],
  templateUrl: './auction-list.html',
  styleUrl: './auction-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuctionListPage {
  private readonly auctionsService = inject(AuctionsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly reloadRequests = new Subject<void>();

  readonly auctions = signal<Auction[]>([]);
  readonly pageData = signal<PaginatedResponse<Auction> | null>(null);
  readonly loading = signal(true);
  readonly hasError = signal(false);
  readonly page = signal(1);
  readonly filters = signal<AuctionListFilters>({
    sortBy: AuctionSortBy.CREATED_AT,
    sortOrder: SortOrder.DESC,
  });
  readonly pageLimit = 12;

  readonly totalPages = computed(() =>
    Math.ceil((this.pageData()?.total ?? 0) / this.pageLimit),
  );

  constructor() {
    this.reloadRequests
      .pipe(
        switchMap(() => {
          this.loading.set(true);
          this.hasError.set(false);

          const query: AuctionSearchQuery = {
            page: this.page(),
            limit: this.pageLimit,
            ...this.filters(),
          };

          return this.auctionsService.getActiveAuctions(query).pipe(
            catchError(() => {
              this.hasError.set(true);
              this.auctions.set([]);
              this.pageData.set(null);
              return EMPTY;
            }),
            finalize(() => this.loading.set(false)),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((response) => {
        this.pageData.set(response);
        this.auctions.set(response.items);
      });

    this.loadAuctions();
  }

  applyFilters(filters: AuctionListFilters): void {
    this.filters.set(filters);
    this.page.set(1);
    this.loadAuctions();
  }

  retry(): void {
    this.loadAuctions();
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages() || page === this.page()) return;
    this.page.set(page);
    scrollToTop();
    this.loadAuctions();
  }

  private loadAuctions(): void {
    this.reloadRequests.next();
  }
}

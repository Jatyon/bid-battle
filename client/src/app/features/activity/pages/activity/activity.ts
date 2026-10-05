import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonComponent, PaginationComponent } from '@app/shared';
import type { PaginatedResponse } from '@core/models/paginated-response.model';
import { SortOrder } from '@core/enums';
import { scrollToTop } from '@core/utils';
import type { AuctionCategory } from '@core/enums';
import type { ActivityTab, MyAuctionFilters, MyBid, MyBidFilters, MyBidStatusFilter } from '@features/activity/models';
import { ActivityFiltersComponent, MyAuctionCardComponent, MyBidCardComponent } from '@features/activity/components';
import { AuctionsService } from '@features/auctions/services';
import type { MyAuction } from '@features/auctions/models';
import { BidsService } from '@features/activity/services';
import { AuctionStatus } from '@features/auctions/enums';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { LucideAngularModule, Gavel, Package, AlertCircle, RotateCcw } from 'lucide-angular';
import { EMPTY, Subject, catchError, finalize, switchMap } from 'rxjs';

@Component({
  selector: 'app-activity',
  imports: [
    TranslocoDirective,
    LucideAngularModule,
    ButtonComponent,
    PaginationComponent,
    MyAuctionCardComponent,
    MyBidCardComponent,
    ActivityFiltersComponent,
  ],
  templateUrl: './activity.html',
  styleUrl: './activity.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivityPage implements OnInit {
  private readonly auctionsService = inject(AuctionsService);
  private readonly bidsService = inject(BidsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly transloco = inject(TranslocoService);

  readonly reloadRequests$ = new Subject<void>();

  readonly activeTab = signal<ActivityTab>('auctions');
  readonly auctions = signal<MyAuction[]>([]);
  readonly bids = signal<MyBid[]>([]);
  readonly auctionsPageData = signal<PaginatedResponse<MyAuction> | null>(null);
  readonly bidsPageData = signal<PaginatedResponse<MyBid> | null>(null);

  readonly loading = signal(true);
  readonly hasError = signal(false);
  readonly page = signal(1);
  readonly pageSize = 10;

  // Filter signals
  readonly search = signal('');
  readonly status = signal('');
  readonly category = signal('');
  readonly sort = signal('createdAt_DESC');

  readonly auctionsTabIcon = Package;
  readonly bidsTabIcon = Gavel;
  readonly errorIcon = AlertCircle;
  readonly resetIcon = RotateCcw;

  readonly defaultSort = computed(() =>
    this.activeTab() === 'bids' ? 'endTime_ASC' : 'createdAt_DESC',
  );

  readonly hasActiveFilters = computed(() =>
    Boolean(
      this.search().trim() ||
      this.status() ||
      this.category() ||
      (this.sort() && this.sort() !== this.defaultSort()),
    ),
  );

  readonly hasNoFilterResults = computed(
    () =>
      this.hasActiveFilters() &&
      (this.activeTab() === 'auctions'
        ? this.auctions().length === 0
        : this.bids().length === 0),
  );

  constructor() {
    this.reloadRequests$
      .pipe(
        switchMap(() => {
          this.loading.set(true);
          this.hasError.set(false);

          if (this.activeTab() === 'auctions') {
            const { sortBy, sortOrder } = this.parseSort(this.sort());
            const filters: MyAuctionFilters = {
              page: this.page(),
              limit: this.pageSize,
              search: this.search() || undefined,
              status: (this.status() as AuctionStatus) || undefined,
              category: (this.category() as AuctionCategory) || undefined,
              sortBy: sortBy as MyAuctionFilters['sortBy'],
              sortOrder,
            };

            return this.auctionsService.getMyAuctions(filters).pipe(
              catchError(() => {
                this.hasError.set(true);
                this.auctions.set([]);
                this.auctionsPageData.set(null);
                return EMPTY;
              }),
              finalize(() => this.loading.set(false)),
            );
          } else {
            const { sortBy, sortOrder } = this.parseSort(this.sort());
            const filters: MyBidFilters = {
              page: this.page(),
              limit: this.pageSize,
              search: this.search() || undefined,
              bidStatus: (this.status() as MyBidStatusFilter) || undefined,
              category: (this.category() as AuctionCategory) || undefined,
              sortBy: sortBy as MyBidFilters['sortBy'],
              sortOrder,
            };

            return this.bidsService.getMyBids(filters).pipe(
              catchError(() => {
                this.hasError.set(true);
                this.bids.set([]);
                this.bidsPageData.set(null);
                return EMPTY;
              }),
              finalize(() => this.loading.set(false)),
            );
          }
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((response) => {
        if (this.activeTab() === 'auctions') {
          const res = response as PaginatedResponse<MyAuction>;
          this.auctionsPageData.set(res);
          this.auctions.set(res.items);
        } else {
          const res = response as PaginatedResponse<MyBid>;
          this.bidsPageData.set(res);
          this.bids.set(res.items);
        }
      });
  }

  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const tabParam = params.get('tab');
      const tab: ActivityTab = tabParam === 'bids' ? 'bids' : 'auctions';
      this.activeTab.set(tab);

      const pageParam = Number(params.get('page')) || 1;
      this.page.set(pageParam >= 1 ? pageParam : 1);

      this.search.set(params.get('search') ?? '');
      this.status.set(params.get('status') ?? '');
      this.category.set(params.get('category') ?? '');

      const defaultSort = this.getDefaultSort(tab);
      const sortParam = params.get('sort') ?? defaultSort;
      this.sort.set(sortParam);

      this.reload();
    });
  }

  get totalPages(): number {
    const total =
      this.activeTab() === 'auctions'
        ? (this.auctionsPageData()?.total ?? 0)
        : (this.bidsPageData()?.total ?? 0);
    return Math.ceil(total / this.pageSize) || 1;
  }

  get totalCount(): number {
    return this.activeTab() === 'auctions'
      ? (this.auctionsPageData()?.total ?? 0)
      : (this.bidsPageData()?.total ?? 0);
  }

  switchTab(tab: ActivityTab): void {
    if (this.activeTab() === tab) return;
    scrollToTop();
    this.activeTab.set(tab);
    this.page.set(1);
    this.search.set('');
    this.status.set('');
    this.category.set('');
    const defaultSort = this.getDefaultSort(tab);
    this.sort.set(defaultSort);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab },
    });
  }

  onSearchChange(value: string): void {
    this.search.set(value);
    this.page.set(1);
    this.updateQueryParams({ search: value || null, page: 1 });
  }

  onSelectStatus(value: string): void {
    this.status.set(value);
    this.page.set(1);
    this.updateQueryParams({ status: value || null, page: 1 });
  }

  onCategoryChange(value: string): void {
    this.category.set(value);
    this.page.set(1);
    this.updateQueryParams({ category: value || null, page: 1 });
  }

  onSortChange(value: string): void {
    const defaultSort = this.defaultSort();
    const sortVal = value || defaultSort;
    this.sort.set(sortVal);
    this.page.set(1);
    this.updateQueryParams({
      sort: sortVal !== defaultSort ? sortVal : null,
      page: 1,
    });
  }

  resetFilters(): void {
    scrollToTop();
    const defaultSort = this.defaultSort();
    this.search.set('');
    this.status.set('');
    this.category.set('');
    this.sort.set(defaultSort);
    this.page.set(1);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: this.activeTab() },
    });
  }

  getDefaultSort(tab: ActivityTab = this.activeTab()): string {
    return tab === 'bids' ? 'endTime_ASC' : 'createdAt_DESC';
  }

  goToPage(pageNumber: number): void {
    if (pageNumber < 1 || pageNumber > this.totalPages || pageNumber === this.page()) return;
    scrollToTop();
    this.updateQueryParams({ page: pageNumber });
  }

  retry(): void {
    this.reload();
  }

  onAuctionCanceled(auctionId: number): void {
    this.auctions.update((list) =>
      list.map((a) => (a.id === auctionId ? { ...a, status: AuctionStatus.CANCELED } : a)),
    );
  }

  navigateToSell(): void {
    this.router.navigate(['/sell']);
  }

  navigateToBrowse(): void {
    this.router.navigate(['/']);
  }

  private updateQueryParams(params: Record<string, string | number | null>): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: params,
      queryParamsHandling: 'merge',
    });
  }

  private parseSort(sortValue: string): { sortBy: string; sortOrder: SortOrder } {
    const [field, order] = sortValue.split('_');
    const sortOrder = order === 'ASC' ? SortOrder.ASC : SortOrder.DESC;
    return { sortBy: field || 'createdAt', sortOrder };
  }

  private reload(): void {
    this.reloadRequests$.next();
  }
}

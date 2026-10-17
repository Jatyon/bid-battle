import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonComponent, PaginationComponent } from '@app/shared';
import type { PaginatedResponse } from '@core/models/paginated-response.model';
import type { AuctionCategory } from '@core/enums';
import { scrollToTop } from '@core/utils';
import { DEFAULT_PAGE_SIZE } from '@core/constants';
import { SortOrder } from '@core/enums';
import type {
  ActivityTab,
  MyAuctionFilters,
  MyBid,
  MyBidFilters,
  MyBidStatusFilter,
} from '@features/activity/models';
import {
  ActivityFiltersComponent,
  MyAuctionCardComponent,
  MyBidCardComponent,
} from '@features/activity/components';
import { AuctionsService } from '@features/auctions/services';
import type { MyAuction } from '@features/auctions/models';
import { BidsService } from '@features/activity/services';
import { AuctionStatus } from '@features/auctions/enums';
import { TranslocoDirective } from '@jsverse/transloco';
import { LucideAngularModule, Gavel, Package, AlertCircle, RotateCcw } from 'lucide-angular';
import {
  EMPTY,
  Subject,
  catchError,
  distinctUntilChanged,
  finalize,
  map,
  merge,
  switchMap,
} from 'rxjs';

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
export class ActivityPage {
  private readonly auctionsService = inject(AuctionsService);
  private readonly bidsService = inject(BidsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly reloadRequests$ = new Subject<void>();

  readonly activeTab = signal<ActivityTab>('auctions');
  readonly auctions = signal<MyAuction[]>([]);
  readonly bids = signal<MyBid[]>([]);
  readonly auctionsPageData = signal<PaginatedResponse<MyAuction> | null>(null);
  readonly bidsPageData = signal<PaginatedResponse<MyBid> | null>(null);

  readonly loading = signal(true);
  readonly hasError = signal(false);
  readonly page = signal(1);
  readonly pageSize = DEFAULT_PAGE_SIZE;

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
      (this.activeTab() === 'auctions' ? this.auctions().length === 0 : this.bids().length === 0),
  );

  readonly totalPages = computed(() => {
    const total =
      this.activeTab() === 'auctions'
        ? (this.auctionsPageData()?.total ?? 0)
        : (this.bidsPageData()?.total ?? 0);
    return Math.ceil(total / this.pageSize) || 1;
  });

  readonly totalCount = computed(() =>
    this.activeTab() === 'auctions'
      ? (this.auctionsPageData()?.total ?? 0)
      : (this.bidsPageData()?.total ?? 0),
  );

  private currentRequestId = 0;

  constructor() {
    merge(
      this.route.queryParamMap.pipe(
        distinctUntilChanged(
          (prev, curr) =>
            (prev.get('tab') ?? '') === (curr.get('tab') ?? '') &&
            (prev.get('page') ?? '') === (curr.get('page') ?? '') &&
            (prev.get('search') ?? '') === (curr.get('search') ?? '') &&
            (prev.get('status') ?? '') === (curr.get('status') ?? '') &&
            (prev.get('category') ?? '') === (curr.get('category') ?? '') &&
            (prev.get('sort') ?? '') === (curr.get('sort') ?? ''),
        ),
      ),
      this.reloadRequests$.pipe(map(() => this.route.snapshot.queryParamMap)),
    )
      .pipe(
        switchMap((paramMap) => {
          const requestId = ++this.currentRequestId;
          this.loading.set(true);
          this.hasError.set(false);

          const tabVal = paramMap.get('tab') || '';
          const pageVal = paramMap.get('page') || '';
          const searchVal = paramMap.get('search') || '';
          const statusVal = paramMap.get('status') || '';
          const categoryVal = paramMap.get('category') || '';
          const sortVal = paramMap.get('sort') || '';

          const tab: ActivityTab = tabVal === 'bids' ? 'bids' : 'auctions';
          const pageNum = Number(pageVal) || 1;
          const page = pageNum >= 1 ? pageNum : 1;
          const search = searchVal;
          const status = statusVal;
          const category = categoryVal;
          const defaultSort = this.getDefaultSort(tab);
          const sort = sortVal || defaultSort;

          this.activeTab.set(tab);
          this.page.set(page);
          this.search.set(search);
          this.status.set(status);
          this.category.set(category);
          this.sort.set(sort);

          if (tab === 'auctions') {
            const { sortBy, sortOrder } = this.parseSort(sort);
            const filters: MyAuctionFilters = {
              page,
              limit: this.pageSize,
              search: search || undefined,
              status: (status as AuctionStatus) || undefined,
              category: (category as AuctionCategory) || undefined,
              sortBy: sortBy as MyAuctionFilters['sortBy'],
              sortOrder,
            };

            return this.auctionsService.getMyAuctions(filters).pipe(
              map((res) => ({ tab: 'auctions' as const, res, requestId })),
              catchError(() => {
                if (requestId === this.currentRequestId) {
                  this.hasError.set(true);
                  this.auctions.set([]);
                  this.auctionsPageData.set(null);
                }
                return EMPTY;
              }),
              finalize(() => {
                if (requestId === this.currentRequestId) {
                  this.loading.set(false);
                }
              }),
            );
          } else {
            const { sortBy, sortOrder } = this.parseSort(sort);
            const filters: MyBidFilters = {
              page,
              limit: this.pageSize,
              search: search || undefined,
              bidStatus: (status as MyBidStatusFilter) || undefined,
              category: (category as AuctionCategory) || undefined,
              sortBy: sortBy as MyBidFilters['sortBy'],
              sortOrder,
            };

            return this.bidsService.getMyBids(filters).pipe(
              map((res) => ({ tab: 'bids' as const, res, requestId })),
              catchError(() => {
                if (requestId === this.currentRequestId) {
                  this.hasError.set(true);
                  this.bids.set([]);
                  this.bidsPageData.set(null);
                }
                return EMPTY;
              }),
              finalize(() => {
                if (requestId === this.currentRequestId) {
                  this.loading.set(false);
                }
              }),
            );
          }
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ tab, res, requestId }) => {
        if (requestId !== this.currentRequestId) return;

        if (tab === 'auctions') {
          this.auctionsPageData.set(res);
          this.auctions.set(res.items);
        } else {
          this.bidsPageData.set(res);
          this.bids.set(res.items);
        }
      });
  }

  switchTab(tab: ActivityTab): void {
    if (this.activeTab() === tab) return;

    scrollToTop();
    this.loading.set(true);
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
    if (value === this.search()) return;

    this.loading.set(true);
    this.search.set(value);
    this.page.set(1);
    this.updateQueryParams({ search: value || null, page: 1 });
  }

  onSelectStatus(value: string): void {
    if (value === this.status()) return;

    this.loading.set(true);
    this.status.set(value);
    this.page.set(1);
    this.updateQueryParams({ status: value || null, page: 1 });
  }

  onCategoryChange(value: string): void {
    if (value === this.category()) return;

    this.loading.set(true);
    this.category.set(value);
    this.page.set(1);
    this.updateQueryParams({ category: value || null, page: 1 });
  }

  onSortChange(value: string): void {
    const defaultSort = this.defaultSort();
    const sortVal = value || defaultSort;

    if (sortVal === this.sort()) return;

    this.loading.set(true);
    this.sort.set(sortVal);
    this.page.set(1);
    this.updateQueryParams({
      sort: sortVal !== defaultSort ? sortVal : null,
      page: 1,
    });
  }

  resetFilters(): void {
    scrollToTop();
    this.loading.set(true);
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
    if (pageNumber < 1 || pageNumber > this.totalPages() || pageNumber === this.page()) return;
    scrollToTop();
    this.loading.set(true);
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

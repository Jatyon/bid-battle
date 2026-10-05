import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { Router, provideRouter } from '@angular/router';
import { AuctionsService } from '@features/auctions/services';
import { BidsService } from '@features/activity/services';
import { ActivityPage } from './activity';
import { provideTransloco, TranslocoLoader, Translation } from '@jsverse/transloco';
import { Observable, of } from 'rxjs';

class TestTranslocoLoader implements TranslocoLoader {
  getTranslation(): Observable<Translation> {
    return of({
      ACTIVITY: {
        PAGE: { TITLE: 'My Activity', SUBTITLE: 'Track items' },
        TABS: { AUCTIONS: 'My Auctions', BIDS: 'My Bids' },
        STATUS: { ACTIVE: 'Active', ENDED: 'Ended', CANCELED: 'Canceled', PENDING: 'Pending' },
        AUCTIONS: { EMPTY_TITLE: 'No auctions', EMPTY_DESCRIPTION: 'Create one', CREATE_BTN: 'Create' },
        BIDS: { EMPTY_TITLE: 'No bids', EMPTY_DESCRIPTION: 'Browse', BROWSE_BTN: 'Browse' },
        FILTERS: {
          SEARCH_PLACEHOLDER: 'Search...',
          ALL: 'All',
          ALL_CATEGORIES: 'All categories',
          CATEGORY: 'Category',
          SORT: 'Sort by',
          STATUS_ACTIVE: 'Active',
          STATUS_ENDED: 'Ended',
          STATUS_CANCELED: 'Canceled',
          BID_WINNING: 'Winning',
          BID_OUTBID: 'Outbid',
          BID_WON: 'Won',
          BID_LOST: 'Lost',
          SORT_NEWEST: 'Newest',
          SORT_ENDING_SOON: 'Ending soon',
          SORT_PRICE_HIGH: 'Price: highest',
          SORT_PRICE_LOW: 'Price: lowest',
          SORT_BID_HIGH: 'My bid: highest',
          RESET: 'Clear filters',
          NO_RESULTS_TITLE: 'No results found',
          NO_RESULTS_DESCRIPTION: 'Try adjusting your filters',
        },
        STATE: {
          LOADING: 'Loading...',
          ERROR: 'Error occurred',
          RETRY: 'Retry',
        },
      },
      AUCTIONS: {
        CATEGORIES: {
          ELECTRONICS: 'Electronics',
          FASHION: 'Fashion',
          HOME_GARDEN: 'Home & Garden',
          COLLECTIBLES: 'Collectibles',
          VEHICLES: 'Vehicles',
          SPORTS: 'Sports',
          ART: 'Art',
          BOOKS: 'Books',
          TOYS: 'Toys',
          OTHER: 'Other',
        },
      },
    });
  }
}

describe('ActivityPage', () => {
  let component: ActivityPage;
  let fixture: ComponentFixture<ActivityPage>;
  let auctionsService: AuctionsService;
  let bidsService: BidsService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ActivityPage],
      providers: [
        provideRouter([{ path: '**', component: ActivityPage }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTransloco({
          config: { availableLangs: ['en'], defaultLang: 'en' },
          loader: TestTranslocoLoader,
        }),
      ],
    }).compileComponents();

    auctionsService = TestBed.inject(AuctionsService);
    bidsService = TestBed.inject(BidsService);

    vi.spyOn(auctionsService, 'getMyAuctions').mockReturnValue(
      of({ items: [], page: 1, limit: 10, total: 0 }),
    );
    vi.spyOn(bidsService, 'getMyBids').mockReturnValue(
      of({ items: [], page: 1, limit: 10, total: 0 }),
    );

    vi.spyOn(window, 'scrollTo').mockImplementation(vi.fn());

    fixture = TestBed.createComponent(ActivityPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create the activity component', () => {
    expect(component).toBeTruthy();
  });

  it('should default to auctions tab and load auctions with default filters', () => {
    expect(component.activeTab()).toBe('auctions');
    expect(auctionsService.getMyAuctions).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      }),
    );
  });

  it('should switch to bids tab and fetch bids with default filters and scroll to top', async () => {
    component.switchTab('bids');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    expect(component.activeTab()).toBe('bids');
    expect(bidsService.getMyBids).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        limit: 10,
        sortBy: 'endTime',
        sortOrder: 'ASC',
      }),
    );
  });

  it('should update queryParams when selecting status filter', () => {
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigate');
    component.onSelectStatus('ACTIVE');
    expect(navSpy).toHaveBeenCalledWith([], {
      relativeTo: expect.anything(),
      queryParams: { status: 'ACTIVE', page: 1 },
      queryParamsHandling: 'merge',
    });
  });

  it('should update queryParams when selecting category filter', () => {
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigate');
    component.onCategoryChange('ELECTRONICS');
    expect(navSpy).toHaveBeenCalledWith([], {
      relativeTo: expect.anything(),
      queryParams: { category: 'ELECTRONICS', page: 1 },
      queryParamsHandling: 'merge',
    });
  });

  it('should update queryParams when selecting sort option', () => {
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigate');
    component.onSortChange('currentPrice_ASC');
    expect(navSpy).toHaveBeenCalledWith([], {
      relativeTo: expect.anything(),
      queryParams: { sort: 'currentPrice_ASC', page: 1 },
      queryParamsHandling: 'merge',
    });
  });

  it('should reset all filters on auctions tab to createdAt_DESC', () => {
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigate');

    component.status.set('ACTIVE');
    component.category.set('ELECTRONICS');
    component.sort.set('currentPrice_ASC');
    component.search.set('car');

    component.resetFilters();

    expect(component.status()).toBe('');
    expect(component.category()).toBe('');
    expect(component.sort()).toBe('createdAt_DESC');
    expect(component.page()).toBe(1);
    expect(component.search()).toBe('');
    expect(navSpy).toHaveBeenCalledWith([], {
      relativeTo: expect.anything(),
      queryParams: { tab: 'auctions' },
    });
  });

  it('should reset all filters on bids tab to endTime_ASC', () => {
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigate');

    component.activeTab.set('bids');
    component.status.set('WINNING');
    component.sort.set('createdAt_DESC');

    component.resetFilters();

    expect(component.status()).toBe('');
    expect(component.sort()).toBe('endTime_ASC');
    expect(component.hasActiveFilters()).toBe(false);
    expect(navSpy).toHaveBeenCalledWith([], {
      relativeTo: expect.anything(),
      queryParams: { tab: 'bids' },
    });
  });

  it('should update search filter via onSearchChange', () => {
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigate');
    component.onSearchChange('laptop');
    expect(navSpy).toHaveBeenCalledWith([], {
      relativeTo: expect.anything(),
      queryParams: { search: 'laptop', page: 1 },
      queryParamsHandling: 'merge',
    });
  });

  it('should correctly compute hasNoFilterResults when filters are active but list is empty', () => {
    expect(component.hasNoFilterResults()).toBe(false);

    component.status.set('ACTIVE');
    component.auctions.set([]);
    expect(component.hasNoFilterResults()).toBe(true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    component.auctions.set([{ id: 1 } as any]);
    expect(component.hasNoFilterResults()).toBe(false);
  });
});

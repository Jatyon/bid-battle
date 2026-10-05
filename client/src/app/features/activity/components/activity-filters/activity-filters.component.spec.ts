import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { ActivityFiltersComponent } from './activity-filters.component';
import { provideTransloco, TranslocoLoader, Translation } from '@jsverse/transloco';
import { Observable, of } from 'rxjs';

class TestTranslocoLoader implements TranslocoLoader {
  getTranslation(): Observable<Translation> {
    return of({
      ACTIVITY: {
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

describe('ActivityFiltersComponent', () => {
  let component: ActivityFiltersComponent;
  let fixture: ComponentFixture<ActivityFiltersComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ActivityFiltersComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTransloco({
          config: { availableLangs: ['en'], defaultLang: 'en' },
          loader: TestTranslocoLoader,
        }),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ActivityFiltersComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('activeTab', 'auctions');
    fixture.componentRef.setInput('defaultSort', 'createdAt_DESC');
    fixture.detectChanges();
  });

  it('should create the filters component', () => {
    expect(component).toBeTruthy();
  });

  it('should emit statusChange on status chip click', () => {
    const spy = vi.spyOn(component.statusChange, 'emit');
    component.onSelectStatus('ACTIVE');
    expect(spy).toHaveBeenCalledWith('ACTIVE');
  });

  it('should emit categoryChange on category select change', () => {
    const spy = vi.spyOn(component.categoryChange, 'emit');
    component.onCategoryChange('ELECTRONICS');
    expect(spy).toHaveBeenCalledWith('ELECTRONICS');
  });

  it('should emit sortChange on sort select change', () => {
    const spy = vi.spyOn(component.sortChange, 'emit');
    component.onSortChange('currentPrice_ASC');
    expect(spy).toHaveBeenCalledWith('currentPrice_ASC');
  });

  it('should emit resetFilters on reset button click', () => {
    const spy = vi.spyOn(component.resetFilters, 'emit');
    component.onReset();
    expect(spy).toHaveBeenCalled();
  });
});

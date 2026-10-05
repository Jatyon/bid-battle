import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslocoTestingModule } from '@jsverse/transloco';
import {
  PaginationComponent,
  computePaginationItems,
} from './pagination.component';

describe('computePaginationItems', () => {
  it('returns empty array when totalPages <= 1', () => {
    expect(computePaginationItems(1, 0)).toEqual([]);
    expect(computePaginationItems(1, 1)).toEqual([]);
  });

  it('returns all pages without ellipsis when totalPages <= 7', () => {
    const items = computePaginationItems(3, 5);
    expect(items).toEqual([
      { type: 'page', page: 1 },
      { type: 'page', page: 2 },
      { type: 'page', page: 3 },
      { type: 'page', page: 4 },
      { type: 'page', page: 5 },
    ]);
  });

  it('handles page 5 of 10 by providing [1, ellipsis, 4, 5, 6, ellipsis, 10]', () => {
    const items = computePaginationItems(5, 10);
    expect(items).toEqual([
      { type: 'page', page: 1 },
      { type: 'ellipsis', key: 'ellipsis-left' },
      { type: 'page', page: 4 },
      { type: 'page', page: 5 },
      { type: 'page', page: 6 },
      { type: 'ellipsis', key: 'ellipsis-right' },
      { type: 'page', page: 10 },
    ]);
  });

  it('handles beginning of range (page 1 of 10)', () => {
    const items = computePaginationItems(1, 10);
    expect(items).toEqual([
      { type: 'page', page: 1 },
      { type: 'page', page: 2 },
      { type: 'page', page: 3 },
      { type: 'page', page: 4 },
      { type: 'ellipsis', key: 'ellipsis-right' },
      { type: 'page', page: 10 },
    ]);
  });

  it('handles end of range (page 10 of 10)', () => {
    const items = computePaginationItems(10, 10);
    expect(items).toEqual([
      { type: 'page', page: 1 },
      { type: 'ellipsis', key: 'ellipsis-left' },
      { type: 'page', page: 7 },
      { type: 'page', page: 8 },
      { type: 'page', page: 9 },
      { type: 'page', page: 10 },
    ]);
  });
});

describe('PaginationComponent', () => {
  let fixture: ComponentFixture<PaginationComponent>;
  let component: PaginationComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        PaginationComponent,
        TranslocoTestingModule.forRoot({
          langs: {
            en: {
              COMMON: {
                PAGINATION: {
                  LABEL: 'Pagination',
                  PREVIOUS: 'Previous',
                  NEXT: 'Next',
                  PAGE: 'Page {{page}}',
                  MORE: 'More',
                },
              },
            },
          },
          translocoConfig: {
            availableLangs: ['en'],
            defaultLang: 'en',
          },
        }),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PaginationComponent);
    component = fixture.componentInstance;
    vi.spyOn(window, 'scrollTo').mockImplementation(vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not render nav if totalPages <= 1', () => {
    fixture.componentRef.setInput('page', 1);
    fixture.componentRef.setInput('totalPages', 1);
    fixture.detectChanges();

    const nav = fixture.debugElement.query(By.css('nav.pagination'));
    expect(nav).toBeNull();
  });

  it('renders page buttons and ellipsis for page 5 of 10', () => {
    fixture.componentRef.setInput('page', 5);
    fixture.componentRef.setInput('totalPages', 10);
    fixture.detectChanges();

    const nav = fixture.debugElement.query(By.css('nav.pagination'));
    expect(nav).not.toBeNull();

    const pageButtons = fixture.debugElement.queryAll(By.css('.pagination__btn--page'));
    const pageTexts = pageButtons.map((btn) => btn.nativeElement.textContent.trim());
    expect(pageTexts).toEqual(['1', '4', '5', '6', '10']);

    const activeBtn = fixture.debugElement.query(By.css('.pagination__btn--active'));
    expect(activeBtn.nativeElement.textContent.trim()).toBe('5');

    const ellipses = fixture.debugElement.queryAll(By.css('.pagination__ellipsis'));
    expect(ellipses.length).toBe(2);
  });

  it('emits pageChange when clicking page 1, 4, 6 or 10 from page 5', () => {
    fixture.componentRef.setInput('page', 5);
    fixture.componentRef.setInput('totalPages', 10);
    fixture.detectChanges();

    const emitted: number[] = [];
    component.pageChange.subscribe((p) => emitted.push(p));

    const pageButtons = fixture.debugElement.queryAll(By.css('.pagination__btn--page'));

    // Click on page 1
    pageButtons[0].nativeElement.click();
    expect(emitted).toEqual([1]);

    // Click on page 4
    pageButtons[1].nativeElement.click();
    expect(emitted).toEqual([1, 4]);

    // Click on page 6
    pageButtons[3].nativeElement.click();
    expect(emitted).toEqual([1, 4, 6]);

    // Click on page 10
    pageButtons[4].nativeElement.click();
    expect(emitted).toEqual([1, 4, 6, 10]);
  });

  it('emits previous and next page on navigation buttons', () => {
    fixture.componentRef.setInput('page', 5);
    fixture.componentRef.setInput('totalPages', 10);
    fixture.detectChanges();

    const emitted: number[] = [];
    component.pageChange.subscribe((p) => emitted.push(p));

    const navButtons = fixture.debugElement.queryAll(By.css('.pagination__btn--nav'));
    const prevBtn = navButtons[0];
    const nextBtn = navButtons[1];

    prevBtn.nativeElement.click();
    expect(emitted).toEqual([4]);

    nextBtn.nativeElement.click();
    expect(emitted).toEqual([4, 6]);
  });

  it('disables previous button on first page and next button on last page', () => {
    fixture.componentRef.setInput('page', 1);
    fixture.componentRef.setInput('totalPages', 5);
    fixture.detectChanges();

    const navButtons = fixture.debugElement.queryAll(By.css('.pagination__btn--nav'));
    expect(navButtons[0].nativeElement.disabled).toBe(true);
    expect(navButtons[1].nativeElement.disabled).toBe(false);

    fixture.componentRef.setInput('page', 5);
    fixture.detectChanges();

    expect(navButtons[0].nativeElement.disabled).toBe(false);
    expect(navButtons[1].nativeElement.disabled).toBe(true);
  });

  it('scrolls to top smoothly when selecting a page', () => {
    fixture.componentRef.setInput('page', 2);
    fixture.componentRef.setInput('totalPages', 5);
    fixture.detectChanges();

    const pageButtons = fixture.debugElement.queryAll(By.css('.pagination__btn--page'));
    pageButtons[2].nativeElement.click();

    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });
});


import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ButtonComponent, InputComponent, SelectComponent, SelectOption } from '@app/shared';
import { AUCTION_CATEGORIES, auctionCategoryTranslationKey } from '@core/enums';
import { SortOrder } from '@core/enums';
import { AuctionCategory, AuctionListFilters } from '@features/auctions/models';
import { AuctionSortBy } from '@features/auctions/enums';
import { STEP_PRICE } from '@features/auctions/utils';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { LucideAngularModule, RotateCcw, SlidersHorizontal } from 'lucide-angular';

@Component({
  selector: 'app-auction-filters',
  imports: [
    ReactiveFormsModule,
    TranslocoDirective,
    LucideAngularModule,
    InputComponent,
    SelectComponent,
    ButtonComponent,
  ],
  templateUrl: './auction-filters.component.html',
  styleUrl: './auction-filters.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuctionFiltersComponent {
  private readonly transloco = inject(TranslocoService);
  readonly filtersApplied = output<AuctionListFilters>();

  readonly filterForm = new FormGroup({
    search: new FormControl('', { nonNullable: true }),
    category: new FormControl('', { nonNullable: true }),
    minimumPrice: new FormControl('', { nonNullable: true }),
    maximumPrice: new FormControl('', { nonNullable: true }),
    sort: new FormControl('newest', { nonNullable: true }),
  });

  readonly filtersIcon = SlidersHorizontal;
  readonly resetIcon = RotateCcw;

  readonly stepPrice = STEP_PRICE;

  categoryOptions(): SelectOption[] {
    return [
      {
        value: '',
        label: this.transloco.translate('AUCTIONS.FILTERS.ALL_CATEGORIES'),
      },
      ...AUCTION_CATEGORIES.map((value) => ({
        value,
        label: this.transloco.translate(auctionCategoryTranslationKey(value)),
      })),
    ];
  }

  sortOptions(): SelectOption[] {
    return [
      { value: 'newest', label: this.transloco.translate('AUCTIONS.FILTERS.SORT_NEWEST') },
      { value: 'endingSoon', label: this.transloco.translate('AUCTIONS.FILTERS.SORT_ENDING') },
      { value: 'priceLow', label: this.transloco.translate('AUCTIONS.FILTERS.SORT_PRICE_LOW') },
      { value: 'priceHigh', label: this.transloco.translate('AUCTIONS.FILTERS.SORT_PRICE_HIGH') },
    ];
  }

  apply(): void {
    const values = this.filterForm.getRawValue();
    const sorts: Record<string, { sortBy: AuctionSortBy; sortOrder: SortOrder }> = {
      newest: { sortBy: AuctionSortBy.CREATED_AT, sortOrder: SortOrder.DESC },
      endingSoon: { sortBy: AuctionSortBy.END_TIME, sortOrder: SortOrder.ASC },
      priceLow: { sortBy: AuctionSortBy.CURRENT_PRICE, sortOrder: SortOrder.ASC },
      priceHigh: { sortBy: AuctionSortBy.CURRENT_PRICE, sortOrder: SortOrder.DESC },
    };
    const sort = sorts[values.sort] ?? sorts['newest'];

    this.filtersApplied.emit({
      search: values.search.trim() || undefined,
      category: (values.category as AuctionCategory) || undefined,
      minPrice: this.toMinorUnits(values.minimumPrice),
      maxPrice: this.toMinorUnits(values.maximumPrice),
      ...sort,
    });
  }

  reset(): void {
    this.filterForm.reset({
      search: '',
      category: '',
      minimumPrice: '',
      maximumPrice: '',
      sort: 'newest',
    });
    this.apply();
  }

  private toMinorUnits(value: string): number | undefined {
    if (!value.trim()) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : undefined;
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  effect,
  inject,
  input,
  output,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ButtonComponent, InputComponent, SelectComponent, SelectOption } from '@app/shared';
import { buildCategorySelectOptions } from '@core/enums';
import type { ActivityTab } from '@features/activity/models';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { LucideAngularModule, RotateCcw } from 'lucide-angular';
import { debounceTime, distinctUntilChanged } from 'rxjs';

export interface StatusChip {
  key: string;
  labelKey: string;
}

@Component({
  selector: 'app-activity-filters',
  imports: [
    ReactiveFormsModule,
    TranslocoDirective,
    LucideAngularModule,
    ButtonComponent,
    InputComponent,
    SelectComponent,
  ],
  templateUrl: './activity-filters.component.html',
  styleUrl: './activity-filters.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivityFiltersComponent implements OnInit {
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  readonly activeTab = input.required<ActivityTab>();
  readonly status = input('');
  readonly category = input('');
  readonly sort = input('');
  readonly search = input('');
  readonly defaultSort = input.required<string>();

  readonly searchChange = output<string>();
  readonly statusChange = output<string>();
  readonly categoryChange = output<string>();
  readonly sortChange = output<string>();
  readonly resetFilters = output<void>();

  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly categoryControl = new FormControl('', { nonNullable: true });
  readonly sortControl = new FormControl('', { nonNullable: true });

  readonly resetIcon = RotateCcw;

  readonly auctionStatusChips: readonly StatusChip[] = [
    { key: '', labelKey: 'ACTIVITY.FILTERS.ALL' },
    { key: 'ACTIVE', labelKey: 'ACTIVITY.FILTERS.STATUS_ACTIVE' },
    { key: 'ENDED', labelKey: 'ACTIVITY.FILTERS.STATUS_ENDED' },
    { key: 'CANCELED', labelKey: 'ACTIVITY.FILTERS.STATUS_CANCELED' },
  ];

  readonly bidStatusChips: readonly StatusChip[] = [
    { key: '', labelKey: 'ACTIVITY.FILTERS.ALL' },
    { key: 'WINNING', labelKey: 'ACTIVITY.FILTERS.BID_WINNING' },
    { key: 'OUTBID', labelKey: 'ACTIVITY.FILTERS.BID_OUTBID' },
    { key: 'WON', labelKey: 'ACTIVITY.FILTERS.BID_WON' },
    { key: 'LOST', labelKey: 'ACTIVITY.FILTERS.BID_LOST' },
  ];

  readonly currentStatusChips = computed(() =>
    this.activeTab() === 'auctions' ? this.auctionStatusChips : this.bidStatusChips,
  );

  readonly categoryOptions = computed<SelectOption[]>(() =>
    buildCategorySelectOptions(this.transloco, 'ACTIVITY.FILTERS.ALL_CATEGORIES'),
  );

  readonly auctionSortOptions = computed<SelectOption[]>(() => [
    { value: 'createdAt_DESC', label: this.transloco.translate('ACTIVITY.FILTERS.SORT_NEWEST') },
    { value: 'endTime_ASC', label: this.transloco.translate('ACTIVITY.FILTERS.SORT_ENDING_SOON') },
    { value: 'currentPrice_DESC', label: this.transloco.translate('ACTIVITY.FILTERS.SORT_PRICE_HIGH') },
    { value: 'currentPrice_ASC', label: this.transloco.translate('ACTIVITY.FILTERS.SORT_PRICE_LOW') },
  ]);

  readonly bidSortOptions = computed<SelectOption[]>(() => [
    { value: 'endTime_ASC', label: this.transloco.translate('ACTIVITY.FILTERS.SORT_ENDING_SOON') },
    { value: 'createdAt_DESC', label: this.transloco.translate('ACTIVITY.FILTERS.SORT_NEWEST') },
    { value: 'amount_DESC', label: this.transloco.translate('ACTIVITY.FILTERS.SORT_BID_HIGH') },
    { value: 'currentPrice_DESC', label: this.transloco.translate('ACTIVITY.FILTERS.SORT_PRICE_HIGH') },
  ]);

  readonly currentSortOptions = computed(() =>
    this.activeTab() === 'auctions' ? this.auctionSortOptions() : this.bidSortOptions(),
  );

  readonly hasActiveFilters = computed(() =>
    Boolean(
      this.search().trim() ||
      this.status() ||
      this.category() ||
      (this.sort() && this.sort() !== this.defaultSort()),
    ),
  );

  constructor() {
    effect(() => {
      const searchVal = this.search();
      if (this.searchControl.value !== searchVal) {
        this.searchControl.setValue(searchVal, { emitEvent: false });
      }
    });

    effect(() => {
      const catVal = this.category();
      if (this.categoryControl.value !== catVal) {
        this.categoryControl.setValue(catVal, { emitEvent: false });
      }
    });

    effect(() => {
      const sortVal = this.sort() || this.defaultSort();
      if (this.sortControl.value !== sortVal) {
        this.sortControl.setValue(sortVal, { emitEvent: false });
      }
    });
  }

  ngOnInit(): void {
    this.searchControl.valueChanges
      .pipe(debounceTime(350), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((val) => {
        this.searchChange.emit(val.trim());
      });
  }

  onSelectStatus(chipKey: string): void {
    this.statusChange.emit(chipKey);
  }

  onCategoryChange(val: string): void {
    this.categoryChange.emit(val);
  }

  onSortChange(val: string): void {
    this.sortChange.emit(val);
  }

  onReset(): void {
    this.resetFilters.emit();
  }
}

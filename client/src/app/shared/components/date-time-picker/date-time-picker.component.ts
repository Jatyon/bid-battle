import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
  ElementRef,
  afterNextRender,
  Injector,
} from '@angular/core';
import {
  ControlValueAccessor,
  NgControl,
  StatusChangeEvent,
  TouchedChangeEvent,
} from '@angular/forms';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ButtonComponent } from '../button/button.component';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { filter } from 'rxjs';

type DateTimePickerType = 'date' | 'time' | 'datetime-local';

interface CalendarDay {
  key: string;
  number: number;
  isCurrentMonth: boolean;
  isToday: boolean;
}

function formatDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function parseMonthKey(value: string): Date {
  const [year, month] = value.split('-').map(Number);
  return new Date(year, month - 1, 1);
}

@Component({
  selector: 'app-date-time-picker',
  templateUrl: './date-time-picker.component.html',
  styleUrl: './date-time-picker.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoDirective, ButtonComponent],
})
export class DateTimePickerComponent implements ControlValueAccessor, OnInit {
  private static nextId = 0;

  private readonly ngControl = inject(NgControl, { optional: true, self: true });
  private readonly destroyRef = inject(DestroyRef);
  private readonly translocoService = inject(TranslocoService);
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly injector = inject(Injector);

  /** Reactive locale string — updates automatically when the user switches language. */
  private readonly locale = toSignal(this.translocoService.langChanges$, {
    initialValue: this.translocoService.getActiveLang(),
  });
  /**
   * True when the active locale uses a 24-hour clock.
   * Determined by Intl itself — works for any language without a hardcoded list.
   * e.g. 'pl' → 24h, 'de' → 24h, 'en-US' → 12h, 'en-GB' → 24h
   */
  private readonly use24h = computed(() => {
    const resolved = new Intl.DateTimeFormat(this.locale(), { hour: 'numeric' }).resolvedOptions();
    return resolved.hour12 === false;
  });

  readonly label = input('');
  readonly type = input<DateTimePickerType>('datetime-local');
  readonly min = input<string | undefined>(undefined);
  readonly max = input<string | undefined>(undefined);
  readonly step = input<number | undefined>(undefined);
  readonly hint = input('');
  readonly dateLabel = input('');
  readonly timeLabel = input('');
  readonly disabled = input(false);
  readonly required = input(false);
  readonly name = input('');
  readonly id = input(`date-time-${++DateTimePickerComponent.nextId}`);
  readonly ariaLabel = input<string | undefined>(undefined);
  readonly ariaDescribedBy = input<string | undefined>(undefined);
  readonly placeholder = input('');
  readonly reserveHelperSpace = input(true);
  readonly errorMessages = input<Record<string, string>>({});

  readonly valueChange = output<string>();
  readonly value = signal('');
  readonly isFocused = signal(false);
  readonly isOpen = signal(false);
  readonly controlDisabled = signal(false);
  readonly dropUp = signal(false);
  readonly pickerDate = signal('');
  readonly pickerTime = signal('');
  readonly timeMode = signal<'hours' | 'minutes'>('hours');
  private readonly viewMonth = signal(formatMonthKey(new Date()));
  private readonly _errorMessage = signal('');
  readonly errorMessage = this._errorMessage.asReadonly();

  readonly errorId = computed(() => `${this.id()}-error`);
  readonly hintId = computed(() => `${this.id()}-hint`);
  readonly dateValue = computed(() => this.value().slice(0, 10));
  readonly timeValue = computed(() => {
    const separatorIndex = this.value().indexOf('T');
    return separatorIndex >= 0 ? this.value().slice(separatorIndex + 1) : '';
  });
  readonly dateMin = computed(() => this.min()?.slice(0, 10) ?? null);
  readonly dateMax = computed(() => this.max()?.slice(0, 10) ?? null);
  readonly timeMin = computed(() => (this.type() === 'time' ? this.min() : null));
  readonly timeMax = computed(() => (this.type() === 'time' ? this.max() : null));
  readonly displayValue = computed(() => {
    const date = this.pickerDate();
    const time = this.pickerTime();

    if (this.type() === 'date') return date;
    if (this.type() === 'time') return time;
    if (!date || !time) return '';
    return `${date}, ${time}`;
  });
  readonly monthLabel = computed(() =>
    new Intl.DateTimeFormat(this.locale(), { month: 'long', year: 'numeric' }).format(
      parseMonthKey(this.viewMonth()),
    ),
  );
  readonly weekdayLabels = computed(() => {
    const monday = new Date(2026, 0, 5);
    return Array.from({ length: 7 }, (_, index) =>
      new Intl.DateTimeFormat(this.locale(), { weekday: 'short' }).format(
        new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index),
      ),
    );
  });
  readonly calendarDays = computed<CalendarDay[]>(() => {
    const month = parseMonthKey(this.viewMonth());
    const firstDayOffset = (month.getDay() + 6) % 7;
    const firstCell = new Date(month.getFullYear(), month.getMonth(), 1 - firstDayOffset);
    const today = formatDateKey(new Date());

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(
        firstCell.getFullYear(),
        firstCell.getMonth(),
        firstCell.getDate() + index,
      );
      return {
        key: formatDateKey(date),
        number: date.getDate(),
        isCurrentMonth: date.getMonth() === month.getMonth(),
        isToday: formatDateKey(date) === today,
      };
    });
  });
  readonly hours = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0'));
  readonly minutes = computed(() => {
    const minuteStep = Math.max(1, Math.floor((this.step() ?? 900) / 60));
    return Array.from({ length: Math.ceil(60 / minuteStep) }, (_, index) =>
      String(index * minuteStep).padStart(2, '0'),
    ).filter((minute) => Number(minute) < 60);
  });

  /** Flat list of time slots — 24h format for pl, 12h AM/PM for en. */
  readonly timeSlots = computed(() => {
    const minuteStep = Math.max(1, Math.floor((this.step() ?? 1800) / 60));
    const use24h = this.use24h();
    const slots: { value: string; label: string }[] = [];

    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += minuteStep) {
        const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        let label: string;

        if (use24h) {
          label = value; // e.g. "09:00"
        } else {
          const period = h < 12 ? 'AM' : 'PM';
          const displayHour = h % 12 === 0 ? 12 : h % 12;
          label = `${displayHour}:${String(m).padStart(2, '0')} ${period}`;
        }
        slots.push({ value, label });
      }
    }
    return slots;
  });

  readonly pickerDateFormatted = computed(() => {
    const key = this.pickerDate();
    if (!key) return '';
    
    const date = new Date(`${key}T00:00:00`);
    return new Intl.DateTimeFormat(this.locale(), {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  });
  readonly ariaDescribedByValue = computed(() => {
    const ids: string[] = [];
    if (this.ariaDescribedBy()) ids.push(this.ariaDescribedBy()!);
    if (this.errorMessage()) ids.push(this.errorId());
    else if (this.hint()) ids.push(this.hintId());
    return ids.length ? ids.join(' ') : undefined;
  });

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private onChange: (value: string) => void = () => {};
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private onTouched: () => void = () => {};

  constructor() {
    if (this.ngControl) this.ngControl.valueAccessor = this;
  }

  ngOnInit(): void {
    const control = this.ngControl?.control;
    if (!control) return;

    control.events
      .pipe(
        filter(
          (event) => event instanceof TouchedChangeEvent || event instanceof StatusChangeEvent,
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.updateError());
  }

  writeValue(value: string | null): void {
    const nextValue = value ?? '';
    this.value.set(nextValue);
    this.pickerDate.set(nextValue.slice(0, 10));
    this.pickerTime.set(nextValue.includes('T') ? nextValue.slice(11, 16) : nextValue);
    if (nextValue)
      this.viewMonth.set(formatMonthKey(new Date(`${nextValue.slice(0, 10)}T00:00:00`)));
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.controlDisabled.set(disabled);
  }

  togglePicker(): void {
    if (this.disabled() || this.controlDisabled()) return;
    if (this.isOpen()) this.closePicker();
    else this.openPicker();
  }

  openPicker(): void {
    const rect = this.elementRef.nativeElement.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const pickerHeightApprox = 380;

    this.dropUp.set(spaceBelow < pickerHeightApprox && rect.top > spaceBelow);

    this.isOpen.set(true);
    this.isFocused.set(true);
    if (this.type() !== 'time') {
      const date = this.pickerDate() || formatDateKey(new Date());
      this.pickerDate.set(date);
      this.viewMonth.set(date.slice(0, 7));
    }
    this.ensureValidTime();
    this.scrollToSelectedTime();
  }

  closePicker(): void {
    this.isOpen.set(false);
    this.isFocused.set(false);
    this.onTouched();
  }

  @HostListener('document:click', ['$event.target'])
  onDocumentClick(target: EventTarget | null): void {
    if (
      this.isOpen() &&
      target instanceof Node &&
      !this.elementRef.nativeElement.contains(target)
    ) {
      this.closePicker();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.isOpen()) this.cancelPicker();
  }

  previousMonth(): void {
    const month = parseMonthKey(this.viewMonth());
    this.viewMonth.set(formatMonthKey(new Date(month.getFullYear(), month.getMonth() - 1, 1)));
  }

  nextMonth(): void {
    const month = parseMonthKey(this.viewMonth());
    this.viewMonth.set(formatMonthKey(new Date(month.getFullYear(), month.getMonth() + 1, 1)));
  }

  selectDate(date: string): void {
    if (!this.isDateAllowed(date)) return;
    this.pickerDate.set(date);

    this.ensureValidTime();
    this.scrollToSelectedTime();

    // For 'date' type apply immediately; for datetime-local wait for Apply button
    if (this.type() === 'date') this.commitValue(date);
  }

  selectTimeSlot(time: string): void {
    if (!this.isTimeAllowed(time)) return;
    this.pickerTime.set(time);
    this.scrollToSelectedTime();
    // For 'time' type apply immediately; for datetime-local wait for Apply button
    if (this.type() === 'time') this.commitValue(time);
  }

  goToToday(): void {
    const today = formatDateKey(new Date());
    this.pickerDate.set(today);
    this.viewMonth.set(today.slice(0, 7));
    this.ensureValidTime();
    this.scrollToSelectedTime();
  }

  cancelPicker(): void {
    // Restore to committed value
    const committed = this.value();
    this.pickerDate.set(committed.slice(0, 10));
    this.pickerTime.set(committed.includes('T') ? committed.slice(11, 16) : committed);
    this.closePicker();
  }

  applyPicker(): void {
    if (this.type() === 'datetime-local') {
      if (!this.pickerDate() || !this.pickerTime()) return;
      this.commitValue(`${this.pickerDate()}T${this.pickerTime()}`);
    } else if (this.type() === 'date') {
      if (!this.pickerDate()) return;
      this.commitValue(this.pickerDate());
    } else {
      if (!this.pickerTime()) return;
      this.commitValue(this.pickerTime());
    }
  }

  selectHour(hour: string): void {
    this.selectTime(hour, this.pickerTime().slice(3, 5) || '00');
  }

  selectMinute(minute: string): void {
    this.selectTime(this.pickerTime().slice(0, 2) || '12', minute);
  }

  selectTimeMode(mode: 'hours' | 'minutes'): void {
    this.timeMode.set(mode);
  }

  private selectTime(hour: string, minute: string): void {
    const time = `${hour}:${minute}`;

    if (!this.isTimeAllowed(time)) return;
    this.pickerTime.set(time);
    if (this.type() === 'time') this.commitValue(time);
    else if (this.pickerDate()) this.commitValue(`${this.pickerDate()}T${time}`);
  }

  isDateAllowed(date: string): boolean {
    const minimum = this.min()?.slice(0, 10);
    const maximum = this.max()?.slice(0, 10);
    return (!minimum || date >= minimum) && (!maximum || date <= maximum);
  }

  isTimeAllowed(time: string): boolean {
    if (this.type() === 'time') {
      return (!this.min() || time >= this.min()!) && (!this.max() || time <= this.max()!);
    } else if (this.type() === 'datetime-local') {
      const selectedDate = this.pickerDate();
      if (!selectedDate) return true;

      const dateTime = `${selectedDate}T${time}`;
      const minimum = this.min() ? this.min()!.substring(0, 16) : null;
      const maximum = this.max() ? this.max()!.substring(0, 16) : null;

      return (!minimum || dateTime >= minimum) && (!maximum || dateTime <= maximum);
    }
    return true;
  }

  private commitValue(nextValue: string): void {
    if (this.type() === 'datetime-local' && (!this.pickerDate() || !this.pickerTime())) return;
    this.updateValue(nextValue);
    this.closePicker();
  }

  private ensureValidTime(): void {
    if (this.type() === 'date') return;

    if (!this.pickerTime() || !this.isTimeAllowed(this.pickerTime())) {
      const slots = this.timeSlots();
      const firstAllowed = slots.find((s) => this.isTimeAllowed(s.value));
      if (firstAllowed) {
        this.pickerTime.set(firstAllowed.value);
      } else if (!this.pickerTime()) {
        this.pickerTime.set('12:00');
      }
    }
  }

  private scrollToSelectedTime(): void {
    if (this.type() === 'date') return;

    afterNextRender(
      () => {
        const container = this.elementRef.nativeElement.querySelector(
          '.date-time-field__time-slots',
        );
        const selectedEl = this.elementRef.nativeElement.querySelector(
          '.date-time-field__time-slot--selected',
        );

        if (container && selectedEl) {
          const containerRect = container.getBoundingClientRect();
          const selectedRect = selectedEl.getBoundingClientRect();

          const relativeTop = selectedRect.top - containerRect.top;
          const centerPos =
            container.scrollTop + relativeTop - containerRect.height / 2 + selectedRect.height / 2;

          container.scrollTo({ top: centerPos, behavior: 'smooth' });
        }
      },
      { injector: this.injector },
    );
  }

  private updateValue(nextValue: string): void {
    this.value.set(nextValue);
    this.pickerDate.set(nextValue.slice(0, 10));
    this.pickerTime.set(nextValue.includes('T') ? nextValue.slice(11, 16) : nextValue);
    this.onChange(nextValue);
    this.valueChange.emit(nextValue);
    this.clearServerError();
  }

  private updateError(): void {
    const control = this.ngControl?.control;
    if (!control?.invalid || !control?.touched) {
      this._errorMessage.set('');
      return;
    }

    const serverError = control.errors?.['serverError'];
    if (typeof serverError === 'string') {
      this._errorMessage.set(serverError);
      return;
    }

    for (const [key, message] of Object.entries(this.errorMessages())) {
      if (control.errors?.[key]) {
        this._errorMessage.set(message);
        return;
      }
    }

    this._errorMessage.set('');
  }

  private clearServerError(): void {
    const control = this.ngControl?.control;
    if (!control?.errors?.['serverError']) return;

    const { ...rest } = control.errors;

    control.setErrors(Object.keys(rest).length ? rest : null);
  }
}

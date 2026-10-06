import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  ControlValueAccessor,
  NgControl,
  StatusChangeEvent,
  TouchedChangeEvent,
} from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SelectOption } from './select.types';
import { filter } from 'rxjs';
import { ChevronDown, LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-select',
  imports: [LucideAngularModule],
  templateUrl: './select.component.html',
  styleUrl: './select.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SelectComponent implements ControlValueAccessor, OnInit {
  private static nextId = 0;

  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly ngControl = inject(NgControl, { optional: true, self: true });
  private readonly destroyRef = inject(DestroyRef);

  readonly chevronIcon = ChevronDown;
  readonly label = input('');
  readonly options = input.required<readonly SelectOption[]>();
  readonly placeholder = input('');
  readonly hint = input('');
  readonly id = input(`select-${++SelectComponent.nextId}`);
  readonly disabled = input(false);
  readonly required = input(false);
  readonly name = input('');
  readonly reserveHelperSpace = input(true);
  readonly ariaLabel = input<string | undefined>(undefined);
  readonly ariaDescribedBy = input<string | undefined>(undefined);
  readonly errorMessages = input<Record<string, string>>({});

  readonly triggerBtn = viewChild<ElementRef<HTMLButtonElement>>('triggerBtn');

  readonly valueChange = output<string>();
  readonly isFocused = signal(false);
  readonly value = signal('');
  readonly controlDisabled = signal(false);
  readonly isOpen = signal(false);
  readonly activeIndex = signal(-1);
  private readonly _errorMessage = signal('');
  readonly errorMessage = this._errorMessage.asReadonly();

  readonly errorId = computed(() => `${this.id()}-error`);
  readonly hintId = computed(() => `${this.id()}-hint`);
  readonly listboxId = computed(() => `${this.id()}-options`);
  readonly selectedOption = computed(
    () => this.options().find((option) => option.value === this.value()) ?? null,
  );
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
    this.value.set(value ?? '');
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

  onFocus(): void {
    this.isFocused.set(true);
  }

  onBlur(): void {
    this.isFocused.set(false);
    this.onTouched();
  }

  toggleOptions(): void {
    if (this.disabled() || this.controlDisabled()) return;

    if (this.isOpen()) {
      this.closeOptions();
      return;
    }

    this.openOptions();
  }

  openOptions(): void {
    this.isOpen.set(true);
    const selectedIndex = this.options().findIndex((option) => option.value === this.value());
    this.activeIndex.set(selectedIndex >= 0 ? selectedIndex : 0);
  }

  closeOptions(): void {
    this.isOpen.set(false);
    this.activeIndex.set(-1);
    this.onTouched();
  }

  optionId(index: number): string {
    return `${this.listboxId()}-option-${index}`;
  }

  selectOption(index: number): void {
    const option = this.options()[index];
    if (!option) return;

    this.selectValue(option.value);
    this.isOpen.set(false);
    this.activeIndex.set(-1);
    this.onTouched();
    this.triggerBtn()?.nativeElement.focus();
  }

  onKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!this.isOpen()) this.openOptions();
        else this.moveActive(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (!this.isOpen()) this.openOptions();
        else this.moveActive(-1);
        break;
      case 'Home':
        if (!this.isOpen()) return;
        event.preventDefault();
        this.activeIndex.set(0);
        break;
      case 'End':
        if (!this.isOpen()) return;
        event.preventDefault();
        this.activeIndex.set(this.options().length - 1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (!this.isOpen()) this.openOptions();
        else this.selectOption(this.activeIndex());
        break;
      case 'Escape':
        if (!this.isOpen()) return;
        event.preventDefault();
        this.closeOptions();
        this.triggerBtn()?.nativeElement.focus();
        break;
    }
  }

  @HostListener('document:click', ['$event.target'])
  onDocumentClick(target: EventTarget | null): void {
    if (
      this.isOpen() &&
      target instanceof Node &&
      !this.elementRef.nativeElement.contains(target)
    ) {
      this.closeOptions();
    }
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

  private moveActive(direction: -1 | 1): void {
    const count = this.options().length;
    if (!count) return;

    const current = this.activeIndex();
    const next = current < 0 ? 0 : (current + direction + count) % count;
    this.activeIndex.set(next);
  }

  private selectValue(value: string): void {
    this.value.set(value);
    this.onChange(value);
    this.valueChange.emit(value);
    this.clearServerError();
  }

  private clearServerError(): void {
    const control = this.ngControl?.control;
    if (!control?.errors?.['serverError']) return;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { serverError: _removed, ...rest } = control.errors;
    control.setErrors(Object.keys(rest).length ? rest : null);
  }
}

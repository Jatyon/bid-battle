import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  ControlValueAccessor,
  NgControl,
  ReactiveFormsModule,
  StatusChangeEvent,
  TouchedChangeEvent,
} from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';

@Component({
  selector: 'app-textarea',
  templateUrl: './textarea.component.html',
  styleUrl: './textarea.component.scss',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TextareaComponent implements ControlValueAccessor, OnInit {
  private static _counter = 0;

  private readonly ngControl = inject(NgControl, { optional: true, self: true });
  private readonly destroyRef = inject(DestroyRef);

  readonly label = input('');
  readonly placeholder = input('');
  readonly hint = input('');
  readonly disabled = input(false);
  readonly readonly = input(false);
  readonly name = input('');
  readonly reserveHelperSpace = input(true);
  readonly id = input(`textarea-${++TextareaComponent._counter}`);
  readonly maxlength = input<number | undefined>(undefined);
  readonly minlength = input<number | undefined>(undefined);
  readonly rows = input<number>(4);
  readonly cols = input<number | undefined>(undefined);
  readonly resizable = input(true);
  readonly required = input(false);
  readonly ariaLabel = input<string | undefined>(undefined);
  readonly ariaDescribedBy = input<string | undefined>(undefined);

  readonly errorMessages = input<Record<string, string>>({});

  readonly valueChange = output<string>();
  readonly focused = output<void>();
  readonly blurred = output<void>();

  readonly isFocused = signal(false);
  readonly value = signal('');

  readonly formDisabled = signal(false);
  readonly effectiveDisabled = computed(() => this.disabled() || this.formDisabled());

  private readonly _errorMessage = signal('');
  readonly errorMessage = this._errorMessage.asReadonly();

  readonly errorId = computed(() => `${this.id()}-error`);
  readonly hintId = computed(() => `${this.id()}-hint`);
  readonly ariaDescribedByValue = computed(() => {
    const ids: string[] = [];
    if (this.ariaDescribedBy()) ids.push(this.ariaDescribedBy()!);
    if (this.errorMessage()) ids.push(this.errorId());
    else if (this.hint()) ids.push(this.hintId());
    return ids.length > 0 ? ids.join(' ') : undefined;
  });

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private onChange: (v: string) => void = () => {};
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
        filter((e) => e instanceof TouchedChangeEvent || e instanceof StatusChangeEvent),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this._updateError());
  }

  writeValue(value: string): void {
    this.value.set(value ?? '');
  }

  registerOnChange(fn: (v: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.formDisabled.set(isDisabled);
  }

  onInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    const val = target.value;
    this.value.set(val);
    this.onChange(val);
    this.valueChange.emit(val);
    this._clearServerError();
  }

  onFocus(): void {
    this.isFocused.set(true);
    this.focused.emit();
  }

  onBlur(): void {
    this.isFocused.set(false);
    this.onTouched();
    this.blurred.emit();
  }

  private _updateError(): void {
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

    for (const [key, msg] of Object.entries(this.errorMessages())) {
      if (control.errors?.[key]) {
        this._errorMessage.set(msg);
        return;
      }
    }

    this._errorMessage.set('');
  }

  private _clearServerError(): void {
    const control = this.ngControl?.control;
    if (!control?.errors?.['serverError']) return;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { serverError: _removed, ...rest } = control.errors;
    control.setErrors(Object.keys(rest).length ? rest : null);
  }
}

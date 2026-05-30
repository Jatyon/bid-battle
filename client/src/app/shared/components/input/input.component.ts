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
import { LucideAngularModule, Eye, EyeOff } from 'lucide-angular';

export type InputType = 'text' | 'email' | 'password' | 'number' | 'tel' | 'search';

@Component({
  selector: 'app-input',
  templateUrl: './input.component.html',
  styleUrl: './input.component.scss',
  imports: [ReactiveFormsModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InputComponent implements ControlValueAccessor, OnInit {
  private static _counter = 0;

  /**
   * Injected directly (not via NG_VALUE_ACCESSOR provider) to eliminate the
   * circular dependency that `forwardRef` created. We assign `this` as the
   * valueAccessor in the constructor, before Angular's form infrastructure
   * calls ngOnChanges on FormControlName.
   */
  private readonly ngControl = inject(NgControl, { optional: true, self: true });
  private readonly destroyRef = inject(DestroyRef);

  readonly eyeIcon = Eye;
  readonly eyeOffIcon = EyeOff;

  readonly label = input('');
  readonly placeholder = input('');
  readonly type = input<InputType>('text');
  readonly hint = input('');
  readonly disabled = input(false);
  readonly readonly = input(false);
  readonly autocomplete = input('');
  readonly name = input('');
  readonly reserveHelperSpace = input(true);
  readonly id = input(`input-${++InputComponent._counter}`);
  readonly maxlength = input<number | undefined>(undefined);
  readonly minlength = input<number | undefined>(undefined);
  readonly pattern = input<string | undefined>(undefined);
  readonly required = input(false);
  readonly ariaLabel = input<string | undefined>(undefined);
  readonly ariaDescribedBy = input<string | undefined>(undefined);

  /**
   * Map of Angular validator error keys → pre-translated message strings.
   * The parent template provides already-translated strings (via `t('...')`),
   * so this component is fully decoupled from i18n.
   *
   * The special `serverError` key is handled automatically: its value in
   * `control.errors` IS the message string (set via `setErrors({ serverError: 'msg' })`).
   *
   * @example
   * [errorMessages]="{
   *   required: t('VALIDATION.REQUIRED'),
   *   email:    t('VALIDATION.EMAIL_INVALID')
   * }"
   */
  readonly errorMessages = input<Record<string, string>>({});

  readonly valueChange = output<string>();
  readonly focused = output<void>();
  readonly blurred = output<void>();

  readonly isFocused = signal(false);
  readonly value = signal('');

  readonly isPasswordType = computed(() => this.type() === 'password');
  readonly isPasswordVisible = signal(false);
  readonly effectiveType = computed<InputType>(() => {
    if (this.isPasswordType()) return this.isPasswordVisible() ? 'text' : 'password';
    return this.type();
  });

  /** Currently active error message. Empty string → no error shown. */
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
    // Set valueAccessor here instead of via NG_VALUE_ACCESSOR provider.
    // This runs before FormControlName.ngOnChanges(), so the binding is in place
    // when Angular's form infrastructure starts using the accessor.
    if (this.ngControl) this.ngControl.valueAccessor = this;
  }

  ngOnInit(): void {
    const control = this.ngControl?.control;
    if (!control) return;

    // Re-evaluate the displayed error whenever validity or touched state changes.
    //  – StatusChangeEvent  → validator results changed (input, programmatic setErrors, etc.)
    //  – TouchedChangeEvent → markAsTouched() / markAllAsTouched() called from parent
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setDisabledState(_isDisabled: boolean): void {
    /* handled via disabled input() */
  }

  onInput(event: Event): void {
    const target = event.target as HTMLInputElement;
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

  togglePasswordVisibility(): void {
    this.isPasswordVisible.update((v) => !v);
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

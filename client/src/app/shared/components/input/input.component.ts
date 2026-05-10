import { ControlValueAccessor, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms';
import { Component, input, computed, signal, forwardRef, output } from '@angular/core';
import { LucideAngularModule, Eye, EyeOff } from 'lucide-angular';

export type InputType = 'text' | 'email' | 'password' | 'number' | 'tel' | 'search';

@Component({
  selector: 'app-input',
  templateUrl: './input.component.html',
  styleUrl: './input.component.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => InputComponent),
      multi: true,
    },
  ],
  imports: [ReactiveFormsModule, LucideAngularModule],
})
export class InputComponent implements ControlValueAccessor {
  readonly eyeIcon = Eye;
  readonly eyeOffIcon = EyeOff;

  readonly label = input('');
  readonly placeholder = input('');
  readonly type = input<InputType>('text');
  readonly error = input('');
  readonly hint = input('');
  readonly disabled = input(false);
  readonly readonly = input(false);
  readonly autocomplete = input('');
  readonly name = input('');
  readonly reserveHelperSpace = input(true);
  readonly id = input(`input-${crypto.randomUUID()}`);
  readonly maxlength = input<number | undefined>(undefined);
  readonly minlength = input<number | undefined>(undefined);
  readonly pattern = input<string | undefined>(undefined);
  readonly required = input(false);
  readonly ariaLabel = input<string | undefined>(undefined);
  readonly ariaDescribedBy = input<string | undefined>(undefined);

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

  readonly errorId = computed(() => `${this.id()}-error`);
  readonly hintId = computed(() => `${this.id()}-hint`);
  readonly ariaDescribedByValue = computed(() => {
    const ids: string[] = [];

    if (this.ariaDescribedBy()) {
      ids.push(this.ariaDescribedBy()!);
    }

    if (this.error()) {
      ids.push(this.errorId());
    } else if (this.hint()) {
      ids.push(this.hintId());
    }

    return ids.length > 0 ? ids.join(' ') : undefined;
  });

  // CVA
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private onChange: (v: string) => void = () => {};
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private onTouched: () => void = () => {};

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
  setDisabledState(isDisabled: boolean): void {
    /* handled via input() */
  }

  onInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    const val = target.value;

    this.value.set(val);
    this.onChange(val);
    this.valueChange.emit(val);
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
    this.isPasswordVisible.update((visible) => !visible);
  }
}

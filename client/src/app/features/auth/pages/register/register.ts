import {
  ReactiveFormsModule,
  FormBuilder,
  Validators,
  ValidationErrors,
  AbstractControl,
} from '@angular/forms';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink, Router } from '@angular/router';
import { ButtonComponent, InputComponent, PopupService } from '@app/shared';
import { AuthService, NotificationService } from '@core/index';
import type { RegisterForm } from '@features/auth/models';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { finalize } from 'rxjs';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, TranslocoModule, InputComponent, ButtonComponent],
  templateUrl: './register.html',
  styleUrl: './register.scss',
})
export class RegisterPage {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly authService = inject(AuthService);
  private readonly notifications = inject(NotificationService);
  private readonly popup = inject(PopupService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly transloco = inject(TranslocoService);

  readonly isLoading = signal(false);

  readonly form = this.fb.group(
    {
      firstName: ['', [Validators.required]],
      lastName: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      password: [
        '',
        [
          Validators.required,
          Validators.minLength(8),
          Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).*$/),
        ],
      ],
      passwordRepeat: [
        '',
        [
          Validators.required,
          Validators.minLength(8),
          Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).*$/),
        ],
      ],
    },
    { validators: this.passwordMatchValidator },
  );

  get firstNameControl() {
    return this.form.controls.firstName;
  }

  get lastNameControl() {
    return this.form.controls.lastName;
  }

  get emailControl() {
    return this.form.controls.email;
  }

  get passwordControl() {
    return this.form.controls.password;
  }

  get passwordRepeatControl() {
    return this.form.controls.passwordRepeat;
  }

  get firstNameErrorKey(): string {
    const c = this.firstNameControl;
    if (!c.invalid || !c.touched) return '';
    if (c.errors?.['required']) return 'AUTH.VALIDATION.FIRST_NAME_REQUIRED';
    return '';
  }

  get lastNameErrorKey(): string {
    const c = this.lastNameControl;
    if (!c.invalid || !c.touched) return '';
    if (c.errors?.['required']) return 'AUTH.VALIDATION.LAST_NAME_REQUIRED';
    return '';
  }

  get emailErrorKey(): string {
    const c = this.emailControl;
    if (!c.invalid || !c.touched) return '';
    if (c.errors?.['required']) return 'AUTH.VALIDATION.EMAIL_REQUIRED';
    if (c.errors?.['email']) return 'AUTH.VALIDATION.EMAIL_INVALID';
    return '';
  }

  get passwordErrorKey(): string {
    const c = this.passwordControl;
    if (!c.invalid || !c.touched) return '';
    if (c.errors?.['required']) return 'AUTH.VALIDATION.PASSWORD_REQUIRED';
    if (c.errors?.['minlength']) return 'AUTH.VALIDATION.PASSWORD_MIN';
    if (c.errors?.['pattern']) return 'AUTH.VALIDATION.PASSWORD_TOO_WEAK';
    return '';
  }

  get passwordRepeatErrorKey(): string {
    const c = this.passwordRepeatControl;
    if (!c.touched) return '';
    if (c.errors?.['required']) return 'AUTH.VALIDATION.PASSWORD_REPEAT_REQUIRED';
    if (c.errors?.['minlength']) return 'AUTH.VALIDATION.PASSWORD_MIN';
    if (c.errors?.['pattern']) return 'AUTH.VALIDATION.PASSWORD_TOO_WEAK';
    if (this.form.errors?.['passwordMismatch']) return 'AUTH.VALIDATION.PASSWORD_MISMATCH';
    return '';
  }

  private passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const password = control.get('password')?.value;
    const passwordRepeat = control.get('passwordRepeat')?.value;

    return password === passwordRepeat ? null : { passwordMismatch: true };
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    if (this.isLoading()) return;

    this.isLoading.set(true);

    const formValue = this.form.getRawValue();
    const data: RegisterForm = {
      firstName: formValue.firstName,
      lastName: formValue.lastName,
      email: formValue.email,
      password: formValue.password,
      passwordRepeat: formValue.passwordRepeat,
    };

    this.authService
      .register(data)
      .pipe(
        finalize(() => this.isLoading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.openInfoPopup();
        },
        error: (err) => {
          const message = err?.error?.message || 'AUTH.REGISTER.ERROR_GENERIC';
          this.notifications.error(message);
          this.focusFirstInvalidField();
        },
      });
  }

  private openInfoPopup(): void {
    this.popup
      .open({
        title: this.transloco.translate('AUTH.REGISTER.SUCCESS_TITLE'),
        message: this.transloco.translate('AUTH.REGISTER.SUCCESS_MESSAGE'),
        type: 'success',
        mode: 'info',
        confirmText: this.transloco.translate('AUTH.REGISTER.SUCCESS_CONFIRM'),
      })
      .then(() => this.router.navigate(['/auth/login']));
  }

  private focusFirstInvalidField(): void {
    const firstInvalidControl = Object.keys(this.form.controls).find(
      (key) => this.form.get(key)?.invalid,
    );

    if (firstInvalidControl) {
      const element = document.getElementById(`input-${firstInvalidControl}`);
      element?.focus();
    }
  }
}

import { AbstractControl, ValidationErrors, Validators } from '@angular/forms';

/**
 * Reusable validator set for a strong password field.
 * Requires min 8 characters with at least one uppercase letter,
 * one lowercase letter, one digit and one special character.
 */
export const strongPasswordValidators = [
  Validators.required,
  Validators.minLength(8),
  Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).*$/),
];

/**
 * Control-level validator for the `passwordRepeat` field.
 * Reads the sibling `password` control from the parent FormGroup and checks
 * that the values match.
 *
 * Apply directly to the `passwordRepeat` AbstractControl (NOT to the FormGroup).
 * The parent component must call
 *   `form.controls.passwordRepeat.updateValueAndValidity({ onlySelf: true })`
 * whenever `password` changes, so this validator re-runs and stays in sync.
 *
 * @example
 * passwordRepeat: ['', [Validators.required, passwordRepeatMatchValidator]],
 */
export function passwordRepeatMatchValidator(control: AbstractControl): ValidationErrors | null {
  const parent = control.parent;
  if (!parent) return null;
  const password = parent.get('password');
  if (!password) return null;
  return control.value === password.value ? null : { passwordMismatch: true };
}

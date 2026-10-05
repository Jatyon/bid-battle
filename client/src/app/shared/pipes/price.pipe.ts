import { Pipe, PipeTransform } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { centsToUnits } from '@core/utils';

const defaultDecimalPipe = new DecimalPipe('en-US');

/**
 * Formats a monetary amount given in the smallest unit (grosze / cents) to a formatted currency string.
 * Example: 1050 -> "10.50 PLN"
 */
export function formatPrice(
  valueInCents: number | null | undefined,
  currency = 'PLN',
  digitsInfo = '1.2-2'
): string {
  if (valueInCents === null || valueInCents === undefined || isNaN(valueInCents)) {
    return `0.00 ${currency}`;
  }

  const formatted = defaultDecimalPipe.transform(centsToUnits(valueInCents), digitsInfo);
  return `${formatted ?? '0.00'} ${currency}`;
}

@Pipe({
  name: 'price',
})
export class PricePipe implements PipeTransform {
  transform(
    valueInCents: number | null | undefined,
    currency = 'PLN',
    digitsInfo = '1.2-2'
  ): string {
    return formatPrice(valueInCents, currency, digitsInfo);
  }
}

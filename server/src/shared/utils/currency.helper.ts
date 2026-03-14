export class CurrencyHelper {
  private static readonly FACTOR = 100;

  static toSubunits(amount: number | string): number {
    const val = typeof amount === 'string' ? parseFloat(amount) : amount;
    return Math.round(val * this.FACTOR);
  }

  static fromSubunits(subunits: number): number {
    return subunits / this.FACTOR;
  }

  static format(subunits: number): string {
    return (subunits / this.FACTOR).toFixed(2);
  }
}

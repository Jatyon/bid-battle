import { ValueTransformer } from 'typeorm';

/**
 * TypeORM transformer for `bigint unsigned` columns.
 *
 * MySQL returns BIGINT values as strings to avoid JS precision loss for large numbers.
 * This transformer converts them back to safe JS integers.
 *
 * All price / amount columns in this system are stored as whole integers
 * (smallest currency unit, e.g. Polish grosz).
 */
export const BigIntTransformer: ValueTransformer = {
  to: (entityValue: number) => entityValue,
  from: (databaseValue: string | null): number | null => {
    if (databaseValue === null || databaseValue === undefined) return null;

    const parsed = parseInt(databaseValue, 10);
    return Number.isNaN(parsed) ? null : parsed;
  },
};

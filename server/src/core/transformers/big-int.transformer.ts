import { ValueTransformer } from 'typeorm';

export const BigIntTransformer: ValueTransformer = {
  to: (entityValue: number) => entityValue,
  from: (databaseValue: string) => parseInt(databaseValue, 10),
};

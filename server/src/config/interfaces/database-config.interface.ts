import { DatabaseType } from 'typeorm';

export interface IDatabaseConfig {
  type: DatabaseType;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  entities: string[];
  migrations: string[];
  seeds: string[];
  migrationsRun: boolean;
  synchronize: boolean;
}

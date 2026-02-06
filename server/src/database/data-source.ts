import { DataSource, type DataSourceOptions } from 'typeorm';
import type { SeederOptions } from 'typeorm-extension';
import * as dotenv from 'dotenv';

dotenv.config();

const options: DataSourceOptions & SeederOptions = {
  type: (process.env.DATABASE_TYPE as 'mysql') || 'mysql',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '3306', 10),
  username: process.env.DATABASE_USER || 'root',
  password: process.env.DATABASE_PASSWORD || 'password',
  database: process.env.DATABASE_NAME || 'app_db',
  entities: ['dist/**/*.entity.js'],
  migrations: ['dist/database/migrations/*.js'],
  seeds: ['dist/database/seeds/*.js'],

  synchronize: false,
};

export default new DataSource(options);

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import os from 'os';

const CONTAINERS_STATE_FILE = join(os.tmpdir(), 'bid-app-e2e-containers.json');

interface ContainersState {
  mysqlId: string;
  mysqlHost: string;
  mysqlPort: number;
  redisId: string;
  redisHost: string;
  redisPort: number;
}

if (!existsSync(CONTAINERS_STATE_FILE)) {
  throw new Error(`Containers state file not found: ${CONTAINERS_STATE_FILE}\n` + `Make sure globalSetup ran correctly.`);
}

const state = JSON.parse(readFileSync(CONTAINERS_STATE_FILE, 'utf8')) as ContainersState;

process.env.NODE_ENV = 'test';
process.env.NAME = 'Bid App E2E';
process.env.CORS_ORIGIN = 'http://localhost';
process.env.FRONTEND_HOST = 'http://localhost:4200';
process.env.JWT_SECRET = 'e2e-test-secret-string-with-length-32!';
process.env.JWT_REFRESH_SECRET = 'e2e-test-refresh-secret-string-with-length-32!';
process.env.JWT_SALT_OR_ROUNDS = '10';

process.env.DATABASE_TYPE = 'mysql';
process.env.DATABASE_HOST = state.mysqlHost;
process.env.DATABASE_PORT = String(state.mysqlPort);
process.env.DATABASE_USER = 'test';
process.env.DATABASE_PASSWORD = 'test';
process.env.DATABASE_NAME = 'bid_app_test';
process.env.DATABASE_SYNCHRONIZE = 'false';
process.env.DATABASE_MIGRATIONS_RUN = 'true';

process.env.REDIS_HOST = state.redisHost;
process.env.REDIS_PORT = String(state.redisPort);
process.env.REDIS_PASSWORD = 'password';

process.env.BID_MIN_INCREMENT_PERCENT = '1';
process.env.BID_MIN_INCREMENT_ABSOLUTE = '0.01';

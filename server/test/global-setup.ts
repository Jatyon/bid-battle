import { MySqlContainer } from '@testcontainers/mysql';
import { RedisContainer } from '@testcontainers/redis';
import { writeFileSync, existsSync, readFileSync, rmSync } from 'fs';
import { execSync } from 'child_process';
import mysql from 'mysql2/promise';
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

async function resetDatabase(host: string, port: number) {
  const connection = await mysql.createConnection({
    host,
    port,
    user: 'test',
    password: 'test',
  });

  await connection.query('DROP DATABASE IF EXISTS bid_app_test');
  await connection.query('CREATE DATABASE bid_app_test');
  await connection.end();
}

export default async function globalSetup() {
  if (existsSync(CONTAINERS_STATE_FILE)) {
    const old = JSON.parse(readFileSync(CONTAINERS_STATE_FILE, 'utf8')) as ContainersState;

    try {
      execSync(`docker inspect ${old.mysqlId}`, { stdio: 'ignore' });
      execSync(`docker inspect ${old.redisId}`, { stdio: 'ignore' });

      await resetDatabase(old.mysqlHost, old.mysqlPort);
      return;
    } catch {
      for (const id of [old.mysqlId, old.redisId]) {
        try {
          execSync(`docker rm -f ${id}`, { stdio: 'ignore' });
        } catch {
          // already removed, ignore
        }
      }
      rmSync(CONTAINERS_STATE_FILE, { force: true });
    }
  }

  const mysqlContainer = await new MySqlContainer('mysql:8.0')
    .withDatabase('bid_app_test')
    .withUsername('test')
    .withUserPassword('test')
    .withCommand(['--default-authentication-plugin=mysql_native_password'])
    .start();

  const redisContainer = await new RedisContainer('redis:8.6-alpine').withPassword('password').start();

  const state: ContainersState = {
    mysqlId: mysqlContainer.getId(),
    mysqlHost: mysqlContainer.getHost(),
    mysqlPort: mysqlContainer.getMappedPort(3306),
    redisId: redisContainer.getId(),
    redisHost: redisContainer.getHost(),
    redisPort: redisContainer.getMappedPort(6379),
  };

  writeFileSync(CONTAINERS_STATE_FILE, JSON.stringify(state, null, 2), 'utf8');

  await resetDatabase(state.mysqlHost, state.mysqlPort);
}

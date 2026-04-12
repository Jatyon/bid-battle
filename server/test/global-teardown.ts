import { rmSync, existsSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import os from 'os';

const CONTAINERS_STATE_FILE = join(os.tmpdir(), 'bid-app-e2e-containers.json');

interface ContainersState {
  mysqlId: string;
  redisId: string;
}

export default function globalTeardown() {
  if (!existsSync(CONTAINERS_STATE_FILE)) return;

  const { mysqlId, redisId } = JSON.parse(readFileSync(CONTAINERS_STATE_FILE, 'utf8')) as ContainersState;

  for (const containerId of [mysqlId, redisId]) {
    if (!containerId) continue;

    try {
      execSync(`docker rm -f ${containerId}`, { stdio: 'ignore' });
    } catch {
      // already removed, ignore
    }
  }

  rmSync(CONTAINERS_STATE_FILE);
}

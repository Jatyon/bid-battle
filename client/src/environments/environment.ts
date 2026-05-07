import { Environment } from './environment.interface';

export const environment: Environment = {
  production: false,
  appName: 'BidBattle',
  storageKeyPrefix: 'bid-battle-',
  apiUrl: 'http://localhost:3000/api/v1',
  wsUrl: 'http://localhost:3000',
  sameOriginWs: false,
};

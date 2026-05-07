import { Environment } from './environment.interface';

export const environment: Environment = {
  production: true,
  appName: 'BidBattle',
  storageKeyPrefix: 'bid-battle-',
  apiUrl: '/api/v1',
  wsUrl: '',
  sameOriginWs: true,
};

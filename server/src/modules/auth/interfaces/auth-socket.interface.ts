import { Language } from '@core/enums';
import { IAuthJwtPayload } from './auth-jwt-payload.interface';
import { Socket } from 'socket.io';

export interface IAuthSocket extends Socket {
  data: {
    user?: IAuthJwtPayload;
    lang: Language;
    eventTimestamps?: number[];
    auctionId?: number;
  };
}

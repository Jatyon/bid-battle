import { IMailUserData } from './mail-user-data.interface';

export interface IMailAuctionOwner extends IMailUserData {
  auctionTitle: string;
  finalPrice: number;
  auctionUrl: string;
  hasWinner: boolean;
  winnerName?: string;
}

import { IMailUserData } from './mail-user-data.interface';

export interface IMailAuctionWinner extends IMailUserData {
  auctionTitle: string;
  finalPrice: number;
  auctionUrl: string;
}

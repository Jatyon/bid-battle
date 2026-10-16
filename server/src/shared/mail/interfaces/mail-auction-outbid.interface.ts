import { IMailUserData } from './mail-user-data.interface';

export interface IMailAuctionOutbid extends IMailUserData {
  auctionTitle: string;
  newPrice: number;
  auctionUrl: string;
}

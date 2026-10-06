import { Language } from '@core/enums';

export interface ProfilePreferences {
  lang: Language;
  notifyOnOutbid: boolean;
  notifyOnAuctionEnd: boolean;
}

export interface PublicProfile {
  id: number;
  firstName: string;
  lastNameInitial: string;
  avatar: string | null;
  joinedAt: string;
}

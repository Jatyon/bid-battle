export interface IOAuthProfile {
  providerId: string;
  email: string;
  emailVerified: boolean;
  firstName: string;
  lastName: string;
  avatar: string | null;
}

export interface IConfigMailer {
  host: string;
  port: number;
  ignoreTLS: boolean;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  from: {
    name: string;
    address: string;
  };
}

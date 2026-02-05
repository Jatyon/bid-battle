export interface IMailOptions {
  to: string;
  subject: string;
  template: string;
  context: Record<string, any>;
}

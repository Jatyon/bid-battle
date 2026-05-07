/** Payload of the `exception` event — emitted by every namespace on a server-side error */
export interface SocketExceptionPayload {
  message: string;
  code: string;
}

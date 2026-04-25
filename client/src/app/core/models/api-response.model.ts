export interface ApiResponse<T> {
  statusCode: number;
  timestamp: string;
  data: T;
}

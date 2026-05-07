import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '@env/environment';
import { ApiResponse } from '@core/models';
import { Observable } from 'rxjs';

/**
 * Base HTTP service.
 * Provides typed wrappers around HttpClient methods with the API base URL pre-configured.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;

  get<T>(
    path: string,
    params?: Record<string, string | number | boolean>,
    context?: HttpContext,
  ): Observable<ApiResponse<T>> {
    const httpParams = params ? new HttpParams({ fromObject: params }) : undefined;
    return this.http.get<ApiResponse<T>>(`${this.baseUrl}${path}`, {
      params: httpParams,
      withCredentials: true,
      context,
    });
  }

  post<T>(path: string, body: unknown, context?: HttpContext): Observable<ApiResponse<T>> {
    return this.http.post<ApiResponse<T>>(`${this.baseUrl}${path}`, body, {
      withCredentials: true,
      context,
    });
  }

  put<T>(path: string, body: unknown, context?: HttpContext): Observable<ApiResponse<T>> {
    return this.http.put<ApiResponse<T>>(`${this.baseUrl}${path}`, body, {
      withCredentials: true,
      context,
    });
  }

  patch<T>(path: string, body: unknown, context?: HttpContext): Observable<ApiResponse<T>> {
    return this.http.patch<ApiResponse<T>>(`${this.baseUrl}${path}`, body, {
      withCredentials: true,
      context,
    });
  }

  delete<T>(path: string, body?: unknown, context?: HttpContext): Observable<ApiResponse<T>> {
    return this.http.delete<ApiResponse<T>>(`${this.baseUrl}${path}`, {
      body,
      withCredentials: true,
      context,
    });
  }
}

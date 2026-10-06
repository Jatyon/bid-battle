import { Injectable, inject } from '@angular/core';
import { User, UpdateProfileRequest } from '@core/models';
import { ApiService } from '@core/services/api.service';
import { ProfilePreferences, PublicProfile } from '../models';
import { Observable, map } from 'rxjs';

/** Performs authenticated profile, avatar, and account operations. */
@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly api = inject(ApiService);

  updateProfile(request: UpdateProfileRequest): Observable<User> {
    return this.api.patch<User>('/user/profile', request).pipe(map((response) => response.data));
  }

  uploadAvatar(file: File): Observable<User> {
    const formData = new FormData();
    formData.append('file', file);
    return this.api.post<User>('/user/avatar', formData).pipe(map((response) => response.data));
  }

  deleteAvatar(): Observable<void> {
    return this.api.delete<{ message: string }>('/user/avatar').pipe(map(() => undefined));
  }

  deleteAccount(): Observable<void> {
    return this.api.delete<{ message: string }>('/user').pipe(map(() => undefined));
  }

  getPreferences(): Observable<ProfilePreferences> {
    return this.api
      .get<ProfilePreferences>('/user/preferences')
      .pipe(map((response) => response.data));
  }

  updatePreferences(preferences: ProfilePreferences): Observable<ProfilePreferences> {
    return this.api
      .put<ProfilePreferences>('/user/preferences', preferences)
      .pipe(map((response) => response.data));
  }

  getPublicProfile(userId: number): Observable<PublicProfile> {
    return this.api.get<PublicProfile>(`/users/${userId}`).pipe(map((response) => response.data));
  }

  searchUsers(query: string): Observable<PublicProfile[]> {
    return this.api
      .get<PublicProfile[]>('/users', { q: query, limit: 10 })
      .pipe(map((response) => response.data));
  }
}

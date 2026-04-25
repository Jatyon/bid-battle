import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '@env/environment';

// Optional: Type definition for which storage to use
export type StorageType = 'local' | 'session';

/**
 * SSR-safe wrapper around localStorage and sessionStorage.
 * Includes key prefixing to prevent collisions and JSON parsing.
 */
@Injectable({ providedIn: 'root' })
export class StorageService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly PREFIX = environment.storageKeyPrefix || 'bid-app-';

  /**
   * Helper to get the correct storage object safely.
   */
  private getStorage(type: StorageType): Storage | null {
    if (!this.isBrowser) return null;
    return type === 'local' ? window.localStorage : window.sessionStorage;
  }

  get(key: string, type: StorageType = 'local'): string | null {
    const storage = this.getStorage(type);
    if (!storage) return null;
    return storage.getItem(`${this.PREFIX}${key}`);
  }

  set(key: string, value: string, type: StorageType = 'local'): void {
    const storage = this.getStorage(type);
    if (!storage) return;
    storage.setItem(`${this.PREFIX}${key}`, value);
  }

  remove(key: string, type: StorageType = 'local'): void {
    const storage = this.getStorage(type);
    if (!storage) return;
    storage.removeItem(`${this.PREFIX}${key}`);
  }

  /**
   * Clears ONLY the items belonging to this app (matching the prefix).
   */
  clear(type: StorageType = 'local'): void {
    const storage = this.getStorage(type);
    if (!storage) return;

    for (let i = storage.length - 1; i >= 0; i--) {
      const currentKey = storage.key(i);
      if (currentKey && currentKey.startsWith(this.PREFIX)) storage.removeItem(currentKey);
    }
  }

  getJson<T>(key: string, type: StorageType = 'local'): T | null {
    const raw = this.get(key, type);
    if (!raw) return null;

    try {
      return JSON.parse(raw) as T;
    } catch {
      console.warn(`[StorageService] Failed to parse JSON for key: ${key}`);
      return null;
    }
  }

  setJson<T>(key: string, value: T, type: StorageType = 'local'): void {
    this.set(key, JSON.stringify(value), type);
  }
}

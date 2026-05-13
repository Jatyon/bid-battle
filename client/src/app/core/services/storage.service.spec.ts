import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { StorageService } from './storage.service';
import { noop } from 'rxjs';

const PREFIX = 'bid-battle-';

describe('StorageService', () => {
  let service: StorageService;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();

    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });
    service = TestBed.inject(StorageService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('get / set (localStorage)', () => {
    it('should store and retrieve a string value', () => {
      service.set('key', 'value');
      expect(service.get('key')).toBe('value');
    });

    it('should prefix keys in localStorage', () => {
      service.set('myKey', 'myValue');
      expect(localStorage.getItem(`${PREFIX}myKey`)).toBe('myValue');
    });

    it('should return null for a non-existent key', () => {
      expect(service.get('does-not-exist')).toBeNull();
    });
  });

  describe('remove()', () => {
    it('should remove a key from localStorage', () => {
      service.set('toRemove', 'data');
      service.remove('toRemove');
      expect(service.get('toRemove')).toBeNull();
    });
  });

  describe('clear()', () => {
    it('should only clear keys with the app prefix', () => {
      service.set('a', '1');
      service.set('b', '2');
      localStorage.setItem('external-key', 'external');

      service.clear();

      expect(service.get('a')).toBeNull();
      expect(service.get('b')).toBeNull();
      expect(localStorage.getItem('external-key')).toBe('external');
    });
  });

  describe('getJson / setJson()', () => {
    it('should serialise and deserialise an object', () => {
      const obj = { id: 1, name: 'test' };
      service.setJson('obj', obj);
      expect(service.getJson('obj')).toEqual(obj);
    });

    it('should return null for a non-existent key', () => {
      expect(service.getJson('missing')).toBeNull();
    });

    it('should return null and warn when stored value is invalid JSON', () => {
      vi.spyOn(console, 'warn').mockImplementation(noop);
      localStorage.setItem(`${PREFIX}badJson`, '{not valid json}');

      expect(service.getJson('badJson')).toBeNull();
      expect(console.warn).toHaveBeenCalled();
    });
  });

  describe('sessionStorage', () => {
    it('should store and retrieve from sessionStorage', () => {
      service.set('sessionKey', 'sessionVal', 'session');
      expect(service.get('sessionKey', 'session')).toBe('sessionVal');
      expect(service.get('sessionKey', 'local')).toBeNull();
    });
  });

  describe('SSR (non-browser platform)', () => {
    let ssrService: StorageService;

    beforeEach(() => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [{ provide: PLATFORM_ID, useValue: 'server' }],
      });
      ssrService = TestBed.inject(StorageService);
    });

    it('should return null for get() on server', () => {
      expect(ssrService.get('anything')).toBeNull();
    });

    it('should not throw for set() on server', () => {
      expect(() => ssrService.set('key', 'val')).not.toThrow();
    });

    it('should not throw for remove() on server', () => {
      expect(() => ssrService.remove('key')).not.toThrow();
    });

    it('should return null for getJson() on server', () => {
      expect(ssrService.getJson('key')).toBeNull();
    });

    it('should not throw for setJson() on server', () => {
      expect(() => ssrService.setJson('key', { data: 1 })).not.toThrow();
    });

    it('should not throw for clear() on server', () => {
      expect(() => ssrService.clear()).not.toThrow();
    });
  });
});

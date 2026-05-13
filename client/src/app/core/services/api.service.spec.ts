import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { HttpContext } from '@angular/common/http';
import { environment } from '@env/environment';
import { ApiService } from './api.service';

const BASE_URL = environment.apiUrl;

describe('ApiService', () => {
  let service: ApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('get()', () => {
    it('should send a GET request to the correct URL', () => {
      service.get('/items').subscribe();

      const req = httpMock.expectOne(`${BASE_URL}/items`);
      expect(req.request.method).toBe('GET');
      expect(req.request.withCredentials).toBe(true);
      req.flush({ data: [] });
    });

    it('should append query params when provided', () => {
      service.get('/items', { page: 1, active: true }).subscribe();

      const req = httpMock.expectOne((r) => r.url === `${BASE_URL}/items`);
      expect(req.request.params.get('page')).toBe('1');
      expect(req.request.params.get('active')).toBe('true');
      req.flush({ data: [] });
    });

    it('should pass the HttpContext when provided', () => {
      const ctx = new HttpContext();
      service.get('/items', undefined, ctx).subscribe();

      const req = httpMock.expectOne(`${BASE_URL}/items`);
      expect(req.request.context).toBe(ctx);
      req.flush({ data: [] });
    });
  });

  describe('post()', () => {
    it('should send a POST request with body', () => {
      const body = { name: 'test' };
      service.post('/items', body).subscribe();

      const req = httpMock.expectOne(`${BASE_URL}/items`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(body);
      expect(req.request.withCredentials).toBe(true);
      req.flush({ data: {} });
    });
  });

  describe('put()', () => {
    it('should send a PUT request with body', () => {
      const body = { name: 'updated' };
      service.put('/items/1', body).subscribe();

      const req = httpMock.expectOne(`${BASE_URL}/items/1`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual(body);
      req.flush({ data: {} });
    });
  });

  describe('patch()', () => {
    it('should send a PATCH request with body', () => {
      const body = { name: 'patched' };
      service.patch('/items/1', body).subscribe();

      const req = httpMock.expectOne(`${BASE_URL}/items/1`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual(body);
      req.flush({ data: {} });
    });
  });

  describe('delete()', () => {
    it('should send a DELETE request', () => {
      service.delete('/items/1').subscribe();

      const req = httpMock.expectOne(`${BASE_URL}/items/1`);
      expect(req.request.method).toBe('DELETE');
      expect(req.request.withCredentials).toBe(true);
      req.flush({ data: {} });
    });

    it('should send a DELETE request with body when provided', () => {
      const body = { reason: 'test' };
      service.delete('/items/1', body).subscribe();

      const req = httpMock.expectOne(`${BASE_URL}/items/1`);
      expect(req.request.body).toEqual(body);
      req.flush({ data: {} });
    });
  });
});

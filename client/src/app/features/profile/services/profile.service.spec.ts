import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { environment } from '@env/environment';
import { User, UpdateProfileRequest } from '@core/models';
import { createUserFixture } from '@test/fixtures/user.fixtures';
import { ProfileService } from './profile.service';

const BASE_URL = environment.apiUrl;

describe('ProfileService', () => {
  let service: ProfileService;
  let httpMock: HttpTestingController;

  const user: User = createUserFixture({
    firstName: 'Alex',
    lastName: 'Smith',
    avatar: 'avatars/alex.jpg',
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(ProfileService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('updates profile and emits the user from the API response', () => {
    let result: User | undefined;
    const request: UpdateProfileRequest = { firstName: 'Alexandra', lastName: 'Smith' };

    service.updateProfile(request).subscribe((response) => (result = response));

    const req = httpMock.expectOne(`${BASE_URL}/user/profile`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual(request);
    req.flush({ data: user });

    expect(result).toEqual(user);
  });

  it('uploads avatar as multipart form data and emits the updated user', () => {
    const file = new File(['avatar image'], 'avatar.png', { type: 'image/png' });
    let result: User | undefined;

    service.uploadAvatar(file).subscribe((response) => (result = response));

    const req = httpMock.expectOne(`${BASE_URL}/user/avatar`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBeInstanceOf(FormData);
    expect((req.request.body as FormData).get('file')).toBe(file);
    req.flush({ data: user });

    expect(result).toEqual(user);
  });

  it('deletes avatar and emits void', () => {
    let result: void | undefined;

    service.deleteAvatar().subscribe((response) => (result = response));

    const req = httpMock.expectOne(`${BASE_URL}/user/avatar`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ data: { message: 'Avatar deleted' } });

    expect(result).toBeUndefined();
  });

  it('deletes account and emits void', () => {
    let result: void | undefined;

    service.deleteAccount().subscribe((response) => (result = response));

    const req = httpMock.expectOne(`${BASE_URL}/user`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ data: { message: 'Account deleted' } });

    expect(result).toBeUndefined();
  });
});

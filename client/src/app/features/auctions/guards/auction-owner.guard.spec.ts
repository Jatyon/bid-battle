import {
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  UrlTree,
  convertToParamMap,
} from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { AuthService, NotificationService, User } from '@core/index';
import { createUserFixture } from '@test/fixtures';
import { AuctionsService } from '../services/auctions.service';
import { auctionOwnerGuard } from './auction-owner.guard';
import { AuctionDetails } from '../models';
import { Observable, firstValueFrom, of, throwError } from 'rxjs';

describe('auctionOwnerGuard', () => {
  let auctionsServiceMock: { getAuctionById: ReturnType<typeof vi.fn> };
  let authServiceMock: { currentUser: ReturnType<typeof vi.fn> };
  let notificationServiceMock: { error: ReturnType<typeof vi.fn> };

  const mockUser: User = createUserFixture({
    id: 10,
    email: 'owner@example.com',
    firstName: 'Owner',
    lastName: 'User',
  });

  const mockAuction = {
    id: 42,
    title: 'Test Auction',
    owner: { id: 10, firstName: 'Owner', lastName: 'User' },
  } as unknown as AuctionDetails;

  beforeEach(() => {
    auctionsServiceMock = {
      getAuctionById: vi.fn(),
    };
    authServiceMock = {
      currentUser: vi.fn().mockReturnValue(mockUser),
    };
    notificationServiceMock = {
      error: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuctionsService, useValue: auctionsServiceMock },
        { provide: AuthService, useValue: authServiceMock },
        { provide: NotificationService, useValue: notificationServiceMock },
      ],
    });
  });

  const createRouteSnapshot = (id: string | null): ActivatedRouteSnapshot =>
    ({
      paramMap: convertToParamMap(id !== null ? { id } : {}),
      data: {},
    }) as unknown as ActivatedRouteSnapshot;

  const mockState = { url: '/edit/42' } as RouterStateSnapshot;

  const runGuard = async (route: ActivatedRouteSnapshot) => {
    const res = TestBed.runInInjectionContext(() => auctionOwnerGuard(route, mockState));
    if (res instanceof Observable) return await firstValueFrom(res);

    return res;
  };

  it('should allow access and attach initialAuction to route.data when current user is the owner', async () => {
    auctionsServiceMock.getAuctionById.mockReturnValue(of(mockAuction));
    const route = createRouteSnapshot('42');

    const result = await runGuard(route);

    expect(auctionsServiceMock.getAuctionById).toHaveBeenCalledWith(42);
    expect(route.data['initialAuction']).toEqual(mockAuction);
    expect(result).toBe(true);
  });

  it('should redirect to "/" and show error notification when user is NOT the owner', async () => {
    const auctionOtherOwner = {
      ...mockAuction,
      owner: { id: 99, firstName: 'Other', lastName: 'Owner' },
    } as unknown as AuctionDetails;

    auctionsServiceMock.getAuctionById.mockReturnValue(of(auctionOtherOwner));
    const route = createRouteSnapshot('42');

    const result = await runGuard(route);

    expect(notificationServiceMock.error).toHaveBeenCalledWith('AUCTIONS.EDIT.ERROR_NOT_OWNER');
    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).toString()).toBe('/');
  });

  it('should redirect to "/" and show error notification when getAuctionById fails', async () => {
    auctionsServiceMock.getAuctionById.mockReturnValue(throwError(() => new Error('Not found')));
    const route = createRouteSnapshot('42');

    const result = await runGuard(route);

    expect(notificationServiceMock.error).toHaveBeenCalledWith('AUCTIONS.EDIT.ERROR_LOAD');
    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).toString()).toBe('/');
  });

  it('should redirect to "/" without calling API when id is missing or not a valid number', async () => {
    const route = createRouteSnapshot('abc');

    const result = await runGuard(route);

    expect(auctionsServiceMock.getAuctionById).not.toHaveBeenCalled();
    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).toString()).toBe('/');
  });

  it('should redirect to "/auth/login" when user is not logged in', async () => {
    authServiceMock.currentUser.mockReturnValue(null);
    const route = createRouteSnapshot('42');

    const result = await runGuard(route);

    expect(auctionsServiceMock.getAuctionById).not.toHaveBeenCalled();
    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).toString()).toContain('/auth/login');
  });
});

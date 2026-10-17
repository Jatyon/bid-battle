import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SocketService, ConnectionStatus } from '@core/services/socket';
import { BidSocketService } from './bid-socket.service';
import { BidSocketEvent } from '../enums';
import { vi, describe, beforeEach, it, expect } from 'vitest';
import { of } from 'rxjs';

interface MockConnection {
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof signal<ConnectionStatus>>;
}

describe('BidSocketService', () => {
  let service: BidSocketService;
  let mockSocketService: { getOrCreate: ReturnType<typeof vi.fn> };
  let mockConnection: MockConnection;
  let statusSignal: ReturnType<typeof signal<ConnectionStatus>>;

  beforeEach(() => {
    statusSignal = signal<ConnectionStatus>('connected');
    mockConnection = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      emit: vi.fn(),
      on: vi.fn().mockReturnValue(of({})),
      status: statusSignal,
    };

    mockSocketService = {
      getOrCreate: vi.fn().mockReturnValue(mockConnection),
    };

    TestBed.configureTestingModule({
      providers: [
        BidSocketService,
        { provide: SocketService, useValue: mockSocketService },
        { provide: PLATFORM_ID, useValue: 'browser' },
      ],
    });

    service = TestBed.inject(BidSocketService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should connect to /bid namespace', () => {
    service.connect();
    expect(mockSocketService.getOrCreate).toHaveBeenCalledWith('/bid');
    expect(mockConnection.connect).toHaveBeenCalled();
  });

  it('should emit join:auction and NOT emit rejoin:auction when joinAuction is called', () => {
    service.connect();
    statusSignal.set('connected');
    TestBed.flushEffects();

    service.joinAuction(123);
    TestBed.flushEffects();

    expect(mockConnection.emit).toHaveBeenCalledWith(BidSocketEvent.JOIN_AUCTION, { auctionId: 123 });
    expect(mockConnection.emit).not.toHaveBeenCalledWith(BidSocketEvent.REJOIN_AUCTION, expect.anything());
  });

  it('should emit rejoin:auction when connection drops and reconnects during active auction', () => {
    service.connect();
    statusSignal.set('connected');
    TestBed.flushEffects();

    service.joinAuction(123);
    TestBed.flushEffects();

    expect(mockConnection.emit).not.toHaveBeenCalledWith(BidSocketEvent.REJOIN_AUCTION, expect.anything());

    // Connection drops
    statusSignal.set('disconnected');
    TestBed.flushEffects();

    // Reconnection occurs
    statusSignal.set('connected');
    TestBed.flushEffects();

    expect(mockConnection.emit).toHaveBeenCalledWith(BidSocketEvent.REJOIN_AUCTION, { auctionId: 123 });
  });

  it('should not emit rejoin:auction on reconnect if leaveAuction was called', () => {
    service.connect();
    statusSignal.set('connected');
    TestBed.flushEffects();

    service.joinAuction(123);
    TestBed.flushEffects();

    service.leaveAuction(123);
    TestBed.flushEffects();

    // Connection drops and reconnects
    statusSignal.set('disconnected');
    TestBed.flushEffects();
    statusSignal.set('connected');
    TestBed.flushEffects();

    expect(mockConnection.emit).not.toHaveBeenCalledWith(BidSocketEvent.REJOIN_AUCTION, expect.anything());
  });

  it('should emit place:bid when placeBid is called', () => {
    service.connect();
    service.placeBid(500);
    expect(mockConnection.emit).toHaveBeenCalledWith(BidSocketEvent.PLACE_BID, { amount: 500 });
  });

  it('should emit request:current:state when requestCurrentState is called', () => {
    service.connect();
    service.requestCurrentState();
    expect(mockConnection.emit).toHaveBeenCalledWith(BidSocketEvent.REQUEST_CURRENT_STATE, {});
  });

  it('should compute status correctly', () => {
    expect(service.status()).toBe('disconnected');
    service.connect();
    expect(service.status()).toBe('connected');
    statusSignal.set('disconnected');
    expect(service.status()).toBe('disconnected');
  });

  it('should emit leave:auction when leaveAuction is called', () => {
    service.joinAuction(123);
    service.leaveAuction(123);
    expect(mockConnection.emit).toHaveBeenCalledWith(BidSocketEvent.LEAVE_AUCTION, { auctionId: 123 });
  });

  it('should disconnect on service destruction', () => {
    service.connect();
    TestBed.resetTestingModule();
    expect(mockConnection.disconnect).toHaveBeenCalled();
  });

  it('should register listener for auction:outbid', () => {
    service.onOutbid().subscribe();
    expect(mockConnection.on).toHaveBeenCalledWith(BidSocketEvent.AUCTION_OUTBID);
  });

  it('should return empty observable when running on server (SSR)', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        BidSocketService,
        { provide: SocketService, useValue: mockSocketService },
        { provide: PLATFORM_ID, useValue: 'server' },
      ],
    });
    const ssrService = TestBed.inject(BidSocketService);
    let emitted = false;
    ssrService.onNewHighestBid().subscribe(() => {
      emitted = true;
    });
    expect(emitted).toBe(false);
  });

  it('should expose activeAuctionId signal tracking current auction', () => {
    expect(service.activeAuctionId()).toBeNull();

    service.joinAuction(456);
    expect(service.activeAuctionId()).toBe(456);

    service.leaveAuction(456);
    expect(service.activeAuctionId()).toBeNull();
  });
});

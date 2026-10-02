import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { Observable, defer, map, of, shareReplay, timer } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuctionClockService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly currentTime$: Observable<number> = defer(() =>
    this.isBrowser ? timer(0, 60_000).pipe(map(() => Date.now())) : of(Date.now()),
  ).pipe(shareReplay({ bufferSize: 1, refCount: true }));
}

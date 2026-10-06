import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { PaginationComponent, AppDatePipe, AvatarComponent } from '@app/shared';
import { PaginatedResponse } from '@core/models';
import { scrollToTop } from '@core/utils';
import { SortOrder } from '@core/enums';
import { PublicProfile } from '@features/profile/models';
import { ProfileService } from '@features/profile/services';
import { Auction, AuctionSearchQuery } from '@features/auctions/models';
import { AuctionCardComponent } from '@features/auctions/components';
import { AuctionsService } from '@features/auctions/services';
import { AuctionSortBy } from '@features/auctions/enums';
import { TranslocoDirective } from '@jsverse/transloco';
import { LucideAngularModule, CalendarDays, Star, Package, HelpCircle } from 'lucide-angular';
import { finalize, switchMap, catchError, EMPTY, Subject, tap } from 'rxjs';

@Component({
  selector: 'app-public-profile',
  imports: [
    TranslocoDirective,
    LucideAngularModule,
    AuctionCardComponent,
    PaginationComponent,
    AppDatePipe,
    AvatarComponent,
  ],
  templateUrl: './public-profile.html',
  styleUrl: './public-profile.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicProfilePage {
  readonly id = input<string>();

  private readonly profileService = inject(ProfileService);
  private readonly auctionsService = inject(AuctionsService);
  private readonly destroyRef = inject(DestroyRef);

  readonly reloadAuctions$ = new Subject<number>();

  readonly profile = signal<PublicProfile | null>(null);
  readonly loadingProfile = signal(true);
  readonly profileError = signal(false);

  readonly auctions = signal<Auction[]>([]);
  readonly pageData = signal<PaginatedResponse<Auction> | null>(null);
  readonly loadingAuctions = signal(false);
  readonly page = signal(1);
  readonly pageLimit = 12;

  readonly calendarIcon = CalendarDays;
  readonly starIcon = Star;
  readonly packageIcon = Package;
  readonly errorIcon = HelpCircle;

  readonly totalPages = computed(() =>
    Math.ceil((this.pageData()?.total ?? 0) / this.pageLimit),
  );

  constructor() {
    this.reloadAuctions$
      .pipe(
        switchMap((userId) => {
          this.loadingAuctions.set(true);
          const query: AuctionSearchQuery = {
            page: this.page(),
            limit: this.pageLimit,
            sortBy: AuctionSortBy.CREATED_AT,
            sortOrder: SortOrder.DESC,
            sellerId: userId,
          };

          return this.auctionsService.getActiveAuctions(query).pipe(
            catchError(() => {
              this.auctions.set([]);
              this.pageData.set(null);
              return EMPTY;
            }),
            finalize(() => this.loadingAuctions.set(false)),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((response) => {
        this.pageData.set(response);
        this.auctions.set(response.items);
      });

    toObservable(this.id)
      .pipe(
        switchMap((idStr) => {
          const userId = Number(idStr);
          if (!userId || isNaN(userId)) {
            this.profileError.set(true);
            this.loadingProfile.set(false);
            return EMPTY;
          }

          this.loadingProfile.set(true);
          this.profileError.set(false);
          this.page.set(1);

          return this.profileService.getPublicProfile(userId).pipe(
            tap((profile) => {
              this.profile.set(profile);
              this.reloadAuctions$.next(userId);
            }),
            catchError(() => {
              this.profileError.set(true);
              return EMPTY;
            }),
            finalize(() => this.loadingProfile.set(false)),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages() || page === this.page()) return;

    this.page.set(page);
    scrollToTop();
    const userId = this.profile()?.id;

    if (userId) this.reloadAuctions$.next(userId);
  }
}

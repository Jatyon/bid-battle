import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { AppDatePipe, AvatarComponent, InputComponent } from '@app/shared';
import { PublicProfile } from '@features/profile/models';
import { ProfileService } from '@features/profile/services';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  filter,
  switchMap,
  EMPTY,
  startWith,
  tap,
  finalize,
} from 'rxjs';
import { LucideAngularModule, Search, User, CalendarDays } from 'lucide-angular';

@Component({
  selector: 'app-users-search',
  imports: [
    TranslocoDirective,
    LucideAngularModule,
    ReactiveFormsModule,
    AvatarComponent,
    InputComponent,
    AppDatePipe,
    RouterLink,
  ],
  templateUrl: './users-search.html',
  styleUrl: './users-search.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsersSearchPage implements OnInit {
  private readonly profileService = inject(ProfileService);
  private readonly destroyRef = inject(DestroyRef);

  readonly searchControl = new FormControl('');
  readonly users = signal<PublicProfile[]>([]);
  readonly loading = signal(false);
  readonly hasSearched = signal(false);

  readonly searchIcon = Search;
  readonly userIcon = User;
  readonly calendarIcon = CalendarDays;

  ngOnInit(): void {
    this.searchControl.valueChanges
      .pipe(
        startWith(this.searchControl.value),
        debounceTime(350),
        distinctUntilChanged(),
        tap((value) => {
          if (!value || value.trim().length < 2) {
            this.users.set([]);
            this.hasSearched.set(false);
            this.loading.set(false);
          } else {
            this.loading.set(true);
            this.hasSearched.set(true);
          }
        }),
        filter((value) => !!value && value.trim().length >= 2),
        switchMap((value) =>
          this.profileService.searchUsers(value!).pipe(
            catchError(() => {
              this.users.set([]);
              return EMPTY;
            }),
            finalize(() => this.loading.set(false)),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((users) => {
        this.users.set(users);
        this.loading.set(false);
      });
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink, RouterLinkActive, Router } from '@angular/router';
import { AuthService, ThemeService } from '@core/services';
import { BrandLogoComponent } from '@app/shared';
import { AuctionSearchComponent } from '@features/auctions/components';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  LucideAngularModule,
  ChevronDown,
  LogOut,
  UserRound,
  Sun,
  Moon,
  UsersRound,
  Gavel,
  Activity,
} from 'lucide-angular';

@Component({
  selector: 'app-navbar',
  imports: [
    RouterLink,
    RouterLinkActive,
    LucideAngularModule,
    TranslocoDirective,
    BrandLogoComponent,
    AuctionSearchComponent,
  ],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NavbarComponent {
  private readonly authService = inject(AuthService);
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly router = inject(Router);
  readonly themeService = inject(ThemeService);

  readonly chevronIcon = ChevronDown;
  readonly logoutIcon = LogOut;
  readonly userIcon = UserRound;
  readonly usersIcon = UsersRound;
  readonly sellIcon = Gavel;
  readonly activityIcon = Activity;
  readonly themeIcon = computed(() => (this.themeService.currentTheme() === 'dark' ? Sun : Moon));

  readonly currentUser = this.authService.currentUser;
  readonly isMenuOpen = signal(false);

  readonly initials = computed(() => {
    const user = this.currentUser();
    if (!user) return '';
    return `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase();
  });

  readonly fullName = computed(() => {
    const user = this.currentUser();
    return user ? `${user.firstName} ${user.lastName}` : '';
  });

  toggleMenu(): void {
    this.isMenuOpen.update((open) => !open);
  }

  closeMenu(): void {
    this.isMenuOpen.set(false);
  }

  logout(): void {
    this.closeMenu();
    this.authService.logout();
  }

  toggleTheme(): void {
    this.themeService.toggle();
  }

  goToLogin(event: Event): void {
    event.preventDefault();
    void this.router.navigate(['/auth/login'], { queryParams: { returnUrl: this.router.url } });
  }

  goToRegister(event: Event): void {
    event.preventDefault();
    void this.router.navigate(['/auth/register'], { queryParams: { returnUrl: this.router.url } });
  }

  @HostListener('document:click', ['$event.target'])
  onDocumentClick(target: EventTarget | null): void {
    if (this.isMenuOpen() && !this.elementRef.nativeElement.contains(target as Node))
      this.closeMenu();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeMenu();
  }
}

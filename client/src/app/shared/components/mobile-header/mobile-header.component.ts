import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ThemeService } from '@core/services/theme.service';
import { AuthService } from '@core/services/auth.service';
import { AuctionSearchComponent } from '../auction-search/auction-search.component';
import { BrandLogoComponent } from '../brand-logo/brand-logo.component';
import { TranslocoDirective } from '@jsverse/transloco';
import { LucideAngularModule, LogOut, Moon, Sun, UserRound } from 'lucide-angular';

@Component({
  selector: 'app-mobile-header',
  imports: [
    BrandLogoComponent,
    RouterLink,
    TranslocoDirective,
    LucideAngularModule,
    AuctionSearchComponent,
  ],
  templateUrl: './mobile-header.component.html',
  styleUrl: './mobile-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MobileHeaderComponent {
  private readonly authService = inject(AuthService);
  readonly themeService = inject(ThemeService);

  readonly currentUser = this.authService.currentUser;
  readonly isMenuOpen = signal(false);
  readonly logoutIcon = LogOut;
  readonly themeIcon = computed(() => (this.themeService.currentTheme() === 'dark' ? Sun : Moon));
  readonly profileIcon = UserRound;

  readonly initials = computed(() => {
    const user = this.currentUser();
    return user ? `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase() : '';
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

  closeFromBackdrop(event: Event): void {
    if (event.target === event.currentTarget) this.closeMenu();
  }

  toggleTheme(): void {
    this.themeService.toggle();
  }

  logout(): void {
    this.closeMenu();
    this.authService.logout();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeMenu();
  }
}

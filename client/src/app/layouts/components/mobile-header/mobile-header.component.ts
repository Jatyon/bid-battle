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
import { LanguageService } from '@core/services/language.service';
import { Language } from '@core/enums';
import { AuctionSearchComponent } from '@features/auctions/components';
import { BrandLogoComponent } from '@shared/components';
import { TranslocoDirective } from '@jsverse/transloco';
import { LucideAngularModule, LogOut, Moon, Sun, UserRound, Globe } from 'lucide-angular';

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
  readonly isLangMenuOpen = signal(false);
  readonly availableLanguages = computed(() => this.languageService.getAvailableLangs());
  readonly logoutIcon = LogOut;
  readonly themeIcon = computed(() => (this.themeService.currentTheme() === 'dark' ? Sun : Moon));
  readonly profileIcon = UserRound;
  readonly languageIcon = Globe;
  private readonly languageService = inject(LanguageService);

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
    if (this.isMenuOpen()) this.isLangMenuOpen.set(false);
  }

  closeMenu(): void {
    this.isMenuOpen.set(false);
  }

  toggleLangMenu(): void {
    this.isLangMenuOpen.update((open) => !open);
    if (this.isLangMenuOpen()) this.isMenuOpen.set(false);
  }

  closeLangMenu(): void {
    this.isLangMenuOpen.set(false);
  }

  closeFromBackdrop(event: Event): void {
    if (event.target === event.currentTarget) {
      this.closeMenu();
      this.closeLangMenu();
    }
  }

  toggleTheme(): void {
    this.themeService.toggle();
  }

  setLanguage(lang: Language): void {
    this.languageService.setLanguage(lang);
    this.closeLangMenu();
  }

  logout(): void {
    this.closeMenu();
    this.authService.logout();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeMenu();
    this.closeLangMenu();
  }
}

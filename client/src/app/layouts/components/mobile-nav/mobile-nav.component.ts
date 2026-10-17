import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, Router } from '@angular/router';
import { AuthService } from '@core/services';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  Activity,
  Gavel,
  House,
  LucideAngularModule,
  LogIn,
  UsersRound,
  UserRound,
} from 'lucide-angular';

@Component({
  selector: 'app-mobile-nav',
  imports: [RouterLink, RouterLinkActive, TranslocoDirective, LucideAngularModule],
  templateUrl: './mobile-nav.component.html',
  styleUrl: './mobile-nav.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MobileNavComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly currentUser = this.authService.currentUser;
  readonly homeIcon = House;
  readonly usersIcon = UsersRound;
  readonly sellIcon = Gavel;
  readonly activityIcon = Activity;
  readonly profileIcon = UserRound;
  readonly loginIcon = LogIn;

  goToLogin(event: Event): void {
    event.preventDefault();
    void this.router.navigate(['/auth/login'], { queryParams: { returnUrl: this.router.url } });
  }
}

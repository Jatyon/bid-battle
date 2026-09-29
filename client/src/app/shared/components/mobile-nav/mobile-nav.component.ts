import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
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

  readonly currentUser = this.authService.currentUser;
  readonly homeIcon = House;
  readonly usersIcon = UsersRound;
  readonly sellIcon = Gavel;
  readonly activityIcon = Activity;
  readonly profileIcon = UserRound;
  readonly loginIcon = LogIn;
}

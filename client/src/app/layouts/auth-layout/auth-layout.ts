import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MobileHeaderComponent } from '@app/shared/components/mobile-header/mobile-header.component';
import { MobileNavComponent } from '@app/shared/components/mobile-nav/mobile-nav.component';
import { NavbarComponent } from '@app/shared/components/navbar/navbar.component';

@Component({
  selector: 'app-auth-layout',
  imports: [RouterOutlet, NavbarComponent, MobileHeaderComponent, MobileNavComponent],
  templateUrl: './auth-layout.html',
  styleUrl: './auth-layout.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthLayout {}

import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MobileHeaderComponent, MobileNavComponent, NavbarComponent } from '@layouts/components';

@Component({
  selector: 'app-auth-layout',
  imports: [RouterOutlet, NavbarComponent, MobileHeaderComponent, MobileNavComponent],
  templateUrl: './auth-layout.html',
  styleUrl: './auth-layout.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthLayout {}

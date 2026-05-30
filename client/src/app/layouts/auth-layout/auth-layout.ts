import { RouterOutlet } from '@angular/router';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { environment } from '@env/environment';

@Component({
  selector: 'app-auth-layout',
  imports: [RouterOutlet],
  templateUrl: './auth-layout.html',
  styleUrl: './auth-layout.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthLayout {
  appName = environment.appName;
}

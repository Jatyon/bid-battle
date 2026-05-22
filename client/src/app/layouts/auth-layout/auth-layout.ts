import { RouterOutlet } from '@angular/router';
import { Component } from '@angular/core';
import { environment } from '@env/environment';

@Component({
  selector: 'app-auth-layout',
  imports: [RouterOutlet],
  templateUrl: './auth-layout.html',
  styleUrl: './auth-layout.scss',
})
export class AuthLayout {
  appName = environment.appName;
}

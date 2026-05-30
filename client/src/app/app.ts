import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from '@core/index';
import { PopupComponent, ToastComponent } from '@shared/index';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastComponent, PopupComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly _themeService = inject(ThemeService);
}

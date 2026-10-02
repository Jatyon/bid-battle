import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MobileHeaderComponent, MobileNavComponent, NavbarComponent } from '@layouts/components';

@Component({
  selector: 'app-main-layout',
  imports: [RouterOutlet, NavbarComponent, MobileHeaderComponent, MobileNavComponent],
  templateUrl: './main-layout.html',
  styleUrl: './main-layout.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MainLayout {}

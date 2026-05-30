import { RouterOutlet } from '@angular/router';
import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-error-layout',
  imports: [RouterOutlet],
  templateUrl: './error-layout.html',
  styleUrl: './error-layout.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ErrorLayout {}

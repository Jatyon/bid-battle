import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-activity-card-col',
  imports: [],
  templateUrl: './activity-card-col.component.html',
  styleUrl: './activity-card-col.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivityCardColComponent {
  readonly label = input.required<string>();
  readonly value = input<string | null | undefined>();
  readonly isPrimary = input<boolean>(false);
  readonly isDate = input<boolean>(false);
}

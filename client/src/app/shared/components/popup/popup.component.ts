import { Component, inject, computed, HostListener, ChangeDetectionStrategy } from '@angular/core';
import { ButtonComponent } from '../button/button.component';
import { PopupService } from './popup.service';
import { PopupType } from './popup.types';
import { TranslocoModule } from '@jsverse/transloco';
import {
  LucideAngularModule,
  LucideIconData,
  Info,
  CircleCheck,
  TriangleAlert,
  CircleX,
} from 'lucide-angular';

@Component({
  selector: 'app-popup',
  standalone: true,
  imports: [LucideAngularModule, TranslocoModule, ButtonComponent],
  templateUrl: './popup.component.html',
  styleUrl: './popup.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PopupComponent {
  private readonly popupService = inject(PopupService);

  readonly state = this.popupService.state;

  readonly icons: Record<PopupType, LucideIconData> = {
    info: Info,
    success: CircleCheck,
    warning: TriangleAlert,
    error: CircleX,
  };

  readonly icon = computed(() => {
    const s = this.state();
    return s ? this.icons[s.type] : null;
  });

  confirm(): void {
    this.popupService.close(true);
  }

  cancel(): void {
    this.popupService.close(false);
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('popup-backdrop'))
      this.popupService.close(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.state()) this.popupService.close(false);
  }
}

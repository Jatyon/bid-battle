import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { scrollToTop } from '@core/utils';
import { TranslocoDirective } from '@jsverse/transloco';
import { ChevronLeft, ChevronRight, LucideAngularModule } from 'lucide-angular';

interface PaginationItemPage {
  readonly type: 'page';
  readonly page: number;
}

interface PaginationItemEllipsis {
  readonly type: 'ellipsis';
  readonly key: string;
}

type PaginationItem = PaginationItemPage | PaginationItemEllipsis;

export function computePaginationItems(currentPage: number, totalPages: number): PaginationItem[] {
  if (totalPages <= 1) return [];

  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => ({
      type: 'page',
      page: i + 1,
    }));
  }

  const items: PaginationItem[] = [];
  const delta = 1;

  let left = Math.max(2, currentPage - delta);
  let right = Math.min(totalPages - 1, currentPage + delta);

  if (currentPage <= 3) right = Math.min(totalPages - 1, 4);
  else if (currentPage >= totalPages - 2) left = Math.max(2, totalPages - 3);

  // First page always present
  items.push({ type: 'page', page: 1 });

  // Left gap
  if (left > 2) {
    if (left === 3) items.push({ type: 'page', page: 2 });
    else items.push({ type: 'ellipsis', key: 'ellipsis-left' });
  }

  // Middle range
  for (let p = left; p <= right; p++) {
    items.push({ type: 'page', page: p });
  }

  // Right gap
  if (right < totalPages - 1) {
    if (right === totalPages - 2) items.push({ type: 'page', page: totalPages - 1 });
    else items.push({ type: 'ellipsis', key: 'ellipsis-right' });
  }

  // Last page always present
  items.push({ type: 'page', page: totalPages });

  return items;
}

@Component({
  selector: 'app-pagination',
  imports: [TranslocoDirective, LucideAngularModule],
  templateUrl: './pagination.component.html',
  styleUrl: './pagination.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaginationComponent {
  readonly page = input.required<number>();
  readonly totalPages = input.required<number>();
  readonly ariaLabel = input<string | null>(null);
  readonly autoScroll = input(true);

  readonly pageChange = output<number>();

  readonly prevIcon = ChevronLeft;
  readonly nextIcon = ChevronRight;

  readonly items = computed(() => computePaginationItems(this.page(), this.totalPages()));

  readonly hasPrevious = computed(() => this.page() > 1);
  readonly hasNext = computed(() => this.page() < this.totalPages());

  onSelectPage(targetPage: number): void {
    if (targetPage >= 1 && targetPage <= this.totalPages() && targetPage !== this.page()) {
      this.scrollToTop();
      this.pageChange.emit(targetPage);
    }
  }

  onPrevious(): void {
    if (this.hasPrevious()) {
      this.scrollToTop();
      this.pageChange.emit(this.page() - 1);
    }
  }

  onNext(): void {
    if (this.hasNext()) {
      this.scrollToTop();
      this.pageChange.emit(this.page() + 1);
    }
  }

  private scrollToTop(): void {
    if (this.autoScroll()) scrollToTop();
  }
}

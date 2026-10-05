import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  BadgeComponent,
  ButtonComponent,
  DateTimePickerComponent,
  InputComponent,
  TextareaComponent,
  SelectComponent,
  SelectOption,
  SwitchComponent,
} from '@app/shared';
import { buildCategorySelectOptions } from '@core/enums';
import { centsToUnits, toCents } from '@core/utils';
import {
  MAX_IMAGES,
  MAX_IMAGE_SIZE_BYTES,
  MIN_PRICE_CENTS,
  MAX_PRICE_CENTS,
  STEP_PRICE,
  MIN_END_TIME_MS,
  MAX_END_TIME_MS,
  TIME_PICKER_STEP_SECONDS,
  toLocalDateTime,
} from '@features/auctions/utils';
import {
  AuctionCategory,
  AuctionDetails,
  AuctionFormData,
  AuctionImageSelection,
} from '@features/auctions/models';
import { AuctionStatus } from '@features/auctions/enums';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { LucideAngularModule, Star, X, Plus } from 'lucide-angular';

@Component({
  selector: 'app-auction-form',
  imports: [
    ReactiveFormsModule,
    TranslocoDirective,
    LucideAngularModule,
    InputComponent,
    TextareaComponent,
    SelectComponent,
    DateTimePickerComponent,
    ButtonComponent,
    SwitchComponent,
    BadgeComponent,
  ],
  templateUrl: './auction-form.component.html',
  styleUrl: './auction-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuctionFormComponent {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly transloco = inject(TranslocoService);

  readonly initialData = input<AuctionDetails | null>(null);
  readonly isEdit = input<boolean>(false);
  readonly isSubmitting = input<boolean>(false);
  readonly submitText = input<string>('');
  readonly progressText = input<string>('');
  readonly submitError = input<string>('');
  readonly hasBids = input<boolean>(false);

  readonly save = output<AuctionFormData>();

  readonly primaryIcon = Star;
  readonly removeIcon = X;
  readonly plusIcon = Plus;
  readonly MAX_IMAGES = MAX_IMAGES;
  readonly MIN_PRICE_CENTS = MIN_PRICE_CENTS;
  readonly MAX_PRICE_CENTS = MAX_PRICE_CENTS;
  readonly stepPrice = STEP_PRICE;
  readonly timePickerStep = TIME_PICKER_STEP_SECONDS;

  readonly minPrice = centsToUnits(MIN_PRICE_CENTS);
  readonly maxPrice = centsToUnits(MAX_PRICE_CENTS);
  readonly images = signal<AuctionImageSelection[]>([]);
  readonly isDraggingImages = signal(false);
  readonly primaryImageIndex = signal(0);
  readonly imageError = signal('');
  readonly dateError = signal('');

  readonly canEditStartTime = computed(
    () => !this.isEdit() || this.initialData()?.status === AuctionStatus.PENDING,
  );

  private dragEnterDepth = 0;

  readonly form = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(255)]],
    description: ['', [Validators.required, Validators.maxLength(5000)]],
    appendDescription: ['', [Validators.maxLength(1000)]],
    startingPrice: [
      '',
      [
        Validators.required,
        Validators.min(this.minPrice),
        Validators.max(this.maxPrice),
        Validators.pattern(/^\d+(?:\.\d{1,2})?$/),
      ],
    ],
    category: ['other' as AuctionCategory],
    startImmediately: [true],
    startTime: [''],
    endTime: [toLocalDateTime(new Date(Date.now() + 24 * 60 * 60 * 1000)), Validators.required],
  });

  /**
   * Reactive signal derived from the startTime form control value change.
   * Used by the `minEndTime` computed to react whenever the user picks a start date.
   */
  private readonly startTimeValue = toSignal(this.form.controls.startTime.valueChanges, {
    initialValue: this.form.controls.startTime.value,
  });

  private readonly startImmediatelyValue = toSignal(
    this.form.controls.startImmediately.valueChanges,
    {
      initialValue: this.form.controls.startImmediately.value,
    },
  );

  /**
   * Minimum allowed end time, recalculated reactively whenever
   * startTime or startImmediately changes.
   */
  readonly minEndTime = computed(() => {
    const scheduledStart = this.startTimeValue();
    const isImmediate = this.startImmediatelyValue();
    const startTime =
      scheduledStart && !isImmediate ? new Date(scheduledStart).getTime() : Date.now();

    const minEndTimestamp = this.calculateMinEndTimestamp(startTime);
    return toLocalDateTime(new Date(minEndTimestamp));
  });

  /**
   * Category options, computed once (transloco translations are stable after load).
   * Avoids repeated re-computation on each change detection cycle.
   */
  readonly categoryOptions = computed<SelectOption[]>(() =>
    buildCategorySelectOptions(this.transloco),
  );

  /**
   * Lower bound for the start-time picker: always "right now" relative to render.
   * Computed as a getter so it re-evaluates on each read rather than staling at init.
   */
  get minStartTime(): string {
    return toLocalDateTime(new Date());
  }

  /**
   * Upper bound shared by both start-time and end-time pickers.
   * Computed as a getter so it re-evaluates on each read.
   */
  get maxEndTime(): string {
    return toLocalDateTime(new Date(Date.now() + MAX_END_TIME_MS));
  }

  constructor() {
    effect(() => {
      const data = this.initialData();
      if (data) {
        this.form.patchValue({
          title: data.title,
          description: data.description,
          category: data.category,
          startImmediately: data.status !== AuctionStatus.PENDING,
          startTime: data.startTime ? toLocalDateTime(data.startTime) : '',
          endTime: toLocalDateTime(data.endTime),
          startingPrice: centsToUnits(data.startingPrice).toString(),
        });

        if (this.hasBids()) {
          this.form.controls.title.disable();
          this.form.controls.category.disable();
          this.form.controls.description.disable();
          this.form.controls.startingPrice.disable();
          this.form.controls.endTime.disable();
        }

        const urls = data.images || [];
        this.images.set(urls.map((url) => ({ previewUrl: url })));
        this.primaryImageIndex.set(data.primaryImageIndex || 0);
      }
    });
  }

  onFilesSelected(event: Event): void {
    const input = event.target;

    if (!(input instanceof HTMLInputElement)) return;
    const files = Array.from(input.files ?? []);
    input.value = '';
    this.addImages(files);
  }

  onImagesDragEnter(event: DragEvent): void {
    if (!this.containsFiles(event)) return;
    event.preventDefault();
    this.dragEnterDepth += 1;
    this.isDraggingImages.set(true);
  }

  onImagesDragOver(event: DragEvent): void {
    if (!this.containsFiles(event)) return;
    event.preventDefault();

    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  }

  onImagesDragLeave(event: DragEvent): void {
    if (!this.containsFiles(event)) return;
    event.preventDefault();
    this.dragEnterDepth = Math.max(0, this.dragEnterDepth - 1);

    if (this.dragEnterDepth === 0) this.isDraggingImages.set(false);
  }

  onImagesDrop(event: DragEvent): void {
    if (!this.containsFiles(event)) return;
    event.preventDefault();
    this.dragEnterDepth = 0;
    this.isDraggingImages.set(false);
    this.addImages(Array.from(event.dataTransfer?.files ?? []));
  }

  private containsFiles(event: DragEvent): boolean {
    return Array.from(event.dataTransfer?.types ?? []).includes('Files');
  }

  private addImages(files: File[]): void {
    if (!files.length) return;
    const total = this.images().length + files.length;

    if (total > MAX_IMAGES) {
      this.imageError.set(
        this.transloco.translate('AUCTIONS.CREATE.IMAGES_TOO_MANY', { max: MAX_IMAGES }),
      );
      return;
    }
    const invalidFile = files.find(
      (f) => !['image/jpeg', 'image/png'].includes(f.type) || f.size > MAX_IMAGE_SIZE_BYTES,
    );

    if (invalidFile) {
      this.imageError.set(this.transloco.translate('AUCTIONS.CREATE.IMAGE_INVALID'));
      return;
    }
    this.imageError.set('');
    const selections = files.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }));
    this.images.update((current) => [...current, ...selections]);
  }

  removeImage(index: number): void {
    const images = this.images();
    const removed = images[index];

    if (!removed) return;

    if (removed.file) URL.revokeObjectURL(removed.previewUrl);
    
    this.images.set(images.filter((_, imageIndex) => imageIndex !== index));

    if (this.primaryImageIndex() === index) this.primaryImageIndex.set(0);
    else if (this.primaryImageIndex() > index) this.primaryImageIndex.update((p) => p - 1);
    this.imageError.set('');
  }

  setPrimaryImage(index: number): void {
    if (index >= 0 && index < this.images().length) this.primaryImageIndex.set(index);
  }

  submit(): void {
    if (this.isSubmitting()) return;

    this.dateError.set('');

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    if (!this.images().length) {
      this.imageError.set(this.transloco.translate('AUCTIONS.CREATE.IMAGES_REQUIRED'));
      return;
    }

    const values = this.form.getRawValue();
    const now = Date.now();
    const isImmediate = values.startImmediately;
    const startTimestamp =
      !isImmediate && values.startTime ? new Date(values.startTime).getTime() : now;

    if (
      !isImmediate &&
      values.startTime &&
      (startTimestamp <= now || startTimestamp > now + MAX_END_TIME_MS)
    ) {
      this.dateError.set(this.transloco.translate('AUCTIONS.CREATE.START_TIME_INVALID'));
      return;
    }

    const endTimestamp = new Date(values.endTime).getTime();
    const minEndTimestamp = this.calculateMinEndTimestamp(startTimestamp, now);

    if (endTimestamp < minEndTimestamp || endTimestamp > now + MAX_END_TIME_MS) {
      this.dateError.set(this.transloco.translate('AUCTIONS.CREATE.END_TIME_INVALID'));
      return;
    }

    const startingPrice = toCents(values.startingPrice);

    if (!Number.isInteger(startingPrice) || startingPrice < 1 || startingPrice > MAX_PRICE_CENTS) {
      this.form.controls.startingPrice.setErrors({ min: true });
      this.form.controls.startingPrice.markAsTouched();
      return;
    }

    this.save.emit({
      formValues: values,
      images: this.images(),
      primaryImageIndex: this.primaryImageIndex(),
    });
  }

  private calculateMinEndTimestamp(startTimeMs: number, now = Date.now()): number {
    let minEnd = Math.max(now + MIN_END_TIME_MS, startTimeMs + MIN_END_TIME_MS);
    const initial = this.initialData();

    if (this.isEdit() && initial?.endTime) {
      const originalEndTime = new Date(initial.endTime).getTime();
      if (originalEndTime > minEnd) minEnd = originalEndTime;
    }
    return minEnd;
  }
}

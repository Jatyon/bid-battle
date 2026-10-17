import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ComponentRef } from '@angular/core';
import { AuctionGalleryComponent } from './auction-gallery.component';
import { provideTransloco, TranslocoLoader, Translation } from '@jsverse/transloco';
import { describe, beforeEach, it, expect } from 'vitest';
import { Observable, of } from 'rxjs';

class TestTranslocoLoader implements TranslocoLoader {
  getTranslation(): Observable<Translation> {
    return of({});
  }
}

describe('AuctionGalleryComponent', () => {
  let component: AuctionGalleryComponent;
  let componentRef: ComponentRef<AuctionGalleryComponent>;
  let fixture: ComponentFixture<AuctionGalleryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AuctionGalleryComponent],
      providers: [
        provideTransloco({
          config: { availableLangs: ['en'], defaultLang: 'en' },
          loader: TestTranslocoLoader,
        }),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AuctionGalleryComponent);
    component = fixture.componentInstance;
    componentRef = fixture.componentRef;
    componentRef.setInput('images', ['img1.jpg', 'img2.jpg', 'img3.jpg']);
    componentRef.setInput('mainImageUrl', 'img1.jpg');
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should select thumbnail image', () => {
    component.selectImage(1);
    expect(component.selectedIndex()).toBe(1);
  });

  it('should open and close lightbox modal', () => {
    expect(component.isLightboxOpen()).toBe(false);
    component.openLightbox(1);
    expect(component.isLightboxOpen()).toBe(true);
    expect(component.lightboxIndex()).toBe(1);

    component.closeLightbox();
    expect(component.isLightboxOpen()).toBe(false);
  });

  it('should navigate next and previous in lightbox', () => {
    component.openLightbox(0);
    component.nextLightboxImage();
    expect(component.lightboxIndex()).toBe(1);

    component.nextLightboxImage();
    expect(component.lightboxIndex()).toBe(2);

    component.nextLightboxImage(); // Wraps around to 0
    expect(component.lightboxIndex()).toBe(0);

    component.prevLightboxImage(); // Wraps around to 2
    expect(component.lightboxIndex()).toBe(2);
  });

  it('should handle keyboard navigation in lightbox', () => {
    component.openLightbox(0);

    component.handleKeyDown(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(component.lightboxIndex()).toBe(1);

    component.handleKeyDown(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(component.lightboxIndex()).toBe(0);

    component.handleKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(component.isLightboxOpen()).toBe(false);
  });
});

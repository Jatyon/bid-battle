import { environment } from '@env/environment';

export function resolveImageUrl(value?: string | null, baseUri?: string): string {
  if (!value) return '';

  try {
    const origin = baseUri || (typeof document !== 'undefined' ? document.baseURI : 'http://localhost');
    const base = new URL(environment.apiUrl, origin);
    if (/^https?:\/\//i.test(value)) return value;
    const path = value.startsWith('/uploads/')
      ? value
      : value.startsWith('uploads/')
        ? `/${value}`
        : `/uploads/${value.replace(/^\//, '')}`;
    return new URL(path, base.origin).toString();
  } catch {
    return value;
  }
}

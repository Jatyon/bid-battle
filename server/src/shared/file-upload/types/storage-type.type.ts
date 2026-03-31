export const STORAGE_TYPES = ['local'] as const;

export type StorageType = (typeof STORAGE_TYPES)[number];

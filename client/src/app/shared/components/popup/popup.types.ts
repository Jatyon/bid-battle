export type PopupType = 'info' | 'success' | 'warning' | 'error';
export type PopupMode = 'info' | 'confirm';

export interface PopupConfig {
  title: string;
  message: string;
  type?: PopupType;
  mode?: PopupMode;
  confirmText?: string;
  cancelText?: string;
}

/** @internal – used by the service to pass resolved callbacks to the component */
export interface PopupState extends Required<
  Pick<PopupConfig, 'type' | 'mode' | 'confirmText' | 'cancelText'>
> {
  title: string;
  message: string;
  resolve: (confirmed: boolean) => void;
}

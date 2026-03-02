import {
  showToast as neoShowToast,
  ToastContainer as NeoToastContainer,
} from '@cred/neopop-web/lib/components';
import { colorPalette, mainColors } from '@cred/neopop-web/lib/primitives';

export { NeoToastContainer as ToastContainer };

export const toast = {
  success: (message: string, _duration?: number) => {
    neoShowToast(message, {
      type: 'success',
      dismissOnClick: true,
      autoCloseTime: _duration ?? 4000,
      colorConfig: { background: mainColors.green, color: mainColors.white },
    });
  },
  error: (message: string, _duration?: number) => {
    neoShowToast(message, {
      type: 'error',
      dismissOnClick: true,
      autoCloseTime: _duration ?? 5000,
      colorConfig: { background: mainColors.red, color: mainColors.white },
    });
  },
  info: (message: string, _duration?: number) => {
    neoShowToast(message, {
      type: 'warning',
      dismissOnClick: true,
      autoCloseTime: _duration ?? 4000,
      colorConfig: { background: colorPalette.rss[500], color: mainColors.white },
    });
  },
  loading: (message: string) => {
    neoShowToast(message, {
      type: 'warning',
      dismissOnClick: false,
      autoCloseTime: 0,
      colorConfig: { background: colorPalette.rss[500], color: mainColors.white },
    });
    return message;
  },
  dismiss: (_id: string) => {
    // NeoPOP toast doesn't support programmatic dismiss by ID
    // Toast will auto-close or be dismissed on click
  },
};

/**
 * Detect whether the app is running inside a Tauri desktop wrapper.
 * When bundled with Tauri, `withGlobalTauri: true` injects `window.__TAURI__`.
 * On web or mobile, this will be undefined.
 */
export const isTauri = (): boolean => {
  return typeof window !== 'undefined' && '__TAURI__' in window;
};

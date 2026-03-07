import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { readFile } from '@tauri-apps/plugin-fs';
import { isTauri } from '../utils/tauri';

type NewPdfHandler = (filePath: string) => void;

let unlistenFn: UnlistenFn | null = null;

/**
 * Open a native folder picker and start watching for new PDFs.
 * @returns the selected folder path, or null if cancelled / not in Tauri
 */
export async function pickAndWatchFolder(): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    const path: string = await invoke('pick_and_watch_folder');
    return path;
  } catch (e: any) {
    if (e === 'cancelled') return null;
    console.error('[WatchFolder] pick_and_watch_folder error:', e);
    return null;
  }
}

/**
 * Returns the currently watched folder path, or null.
 */
export async function getWatchedFolder(): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    return await invoke('get_watched_folder');
  } catch (e) {
    return null;
  }
}

/**
 * Stop watching the current folder.
 */
export async function stopWatching(): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke('stop_watching');
  } catch (e) {
    console.error('[WatchFolder] stop_watching error:', e);
  }
}

/**
 * Subscribe to new PDF events from the watched folder.
 * Call the returned unsubscribe function to stop listening.
 */
export async function onNewPdf(handler: NewPdfHandler): Promise<() => void> {
  if (!isTauri()) return () => {};

  const unlisten = await listen('watch-folder-new-pdf', (event: any) => {
    handler(event.payload as string);
  });

  unlistenFn = unlisten;
  return unlisten;
}

/**
 * Remove the active new-PDF listener.
 */
export function removeNewPdfListener(): void {
  if (unlistenFn) {
    unlistenFn();
    unlistenFn = null;
  }
}

/**
 * Reads a file from the given OS path and returns a File-compatible object
 * for use in processStatement.
 */
export async function importFileFromPath(filePath: string): Promise<any> {
    if (!isTauri()) return null;
    
    const binaryData = await readFile(filePath);
    const fileName = filePath.split('/').pop() || 'statement.pdf';
    
    // Return a mock File object that processStatement expects
    return {
        name: fileName,
        size: binaryData.length,
        type: 'application/pdf',
        arrayBuffer: async () => binaryData.buffer
    };
}

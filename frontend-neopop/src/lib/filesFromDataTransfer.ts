/**
 * Flattens a drag-and-drop {@link DataTransfer} into {@link File} instances,
 * walking directory entries when the File System Access API is available.
 */
export async function filesFromDataTransfer(
  event: Pick<DragEvent, 'dataTransfer'>
): Promise<File[]> {
  const dt = event.dataTransfer;
  if (!dt) return [];

  const items = dt.items;
  if (items?.length && typeof items[0].webkitGetAsEntry === 'function') {
    const files: File[] = [];
    const tasks: Promise<void>[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind !== 'file') continue;
      const entry = item.webkitGetAsEntry?.();
      if (entry) tasks.push(traverseFileTree(entry, files));
    }
    await Promise.all(tasks);
    if (files.length > 0) return files;
  }

  return Array.from(dt.files ?? []);
}

function readEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    reader.readEntries(resolve, reject);
  });
}

async function traverseFileTree(entry: FileSystemEntry, acc: File[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => {
      (entry as FileSystemFileEntry).file(resolve, reject);
    });
    acc.push(file);
    return;
  }
  if (!entry.isDirectory) return;

  const reader = (entry as FileSystemDirectoryEntry).createReader();
  let batch = await readEntries(reader);
  while (batch.length > 0) {
    await Promise.all(batch.map((child) => traverseFileTree(child, acc)));
    batch = await readEntries(reader);
  }
}

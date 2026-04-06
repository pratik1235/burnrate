/**
 * Collects lowercase extensions (without dot) from react-dropzone-style accept map values.
 */
export function allowedExtensionsFromAcceptTypes(acceptTypes: Record<string, string[]>): Set<string> {
  const exts = new Set<string>();
  for (const list of Object.values(acceptTypes)) {
    for (const raw of list) {
      const trimmed = raw.trim().toLowerCase();
      const withoutDot = trimmed.startsWith('.') ? trimmed.slice(1) : trimmed;
      if (withoutDot) exts.add(withoutDot);
    }
  }
  return exts;
}

/**
 * Filters files whose names end with an extension present in acceptTypes (e.g. folder picker output).
 */
export function filterFilesByAcceptTypes(
  files: FileList | File[],
  acceptTypes: Record<string, string[]>
): File[] {
  const allowed = allowedExtensionsFromAcceptTypes(acceptTypes);
  if (allowed.size === 0) return [];
  const list = Array.from(files);
  return list.filter((f) => {
    const name = f.name.toLowerCase();
    const dot = name.lastIndexOf('.');
    if (dot < 0 || dot === name.length - 1) return false;
    const ext = name.slice(dot + 1);
    return allowed.has(ext);
  });
}

/** Human-readable list for subtitles, e.g. "PDF" or "PDF or CSV". */
export function describeAllowedFileKinds(acceptTypes: Record<string, string[]>): string {
  const allowed = allowedExtensionsFromAcceptTypes(acceptTypes);
  const parts: string[] = [];
  if (allowed.has('pdf')) parts.push('PDF');
  if (allowed.has('csv')) parts.push('CSV');
  return parts.length > 0 ? parts.join(' or ') : 'supported files';
}

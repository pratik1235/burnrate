import { describe, expect, it } from 'vitest';
import {
  allowedExtensionsFromAcceptTypes,
  describeAllowedFileKinds,
  filterFilesByAcceptTypes,
} from './statUploadFilter';

function fileNamed(name: string): File {
  return new File([], name, { type: 'application/octet-stream' });
}

describe('allowedExtensionsFromAcceptTypes', () => {
  it('normalizes dotted and undotted extensions', () => {
    const s = allowedExtensionsFromAcceptTypes({
      'application/pdf': ['.pdf'],
      'text/csv': ['csv'],
    });
    expect(s.has('pdf')).toBe(true);
    expect(s.has('csv')).toBe(true);
  });
});

describe('filterFilesByAcceptTypes', () => {
  it('keeps only files whose extension is allowed', () => {
    const files = [fileNamed('a.pdf'), fileNamed('b.txt'), fileNamed('c.PDF')];
    const accept = { 'application/pdf': ['.pdf'] };
    expect(filterFilesByAcceptTypes(files, accept).map((f) => f.name).sort()).toEqual(['a.pdf', 'c.PDF']);
  });

  it('returns empty when nothing matches', () => {
    const files = [fileNamed('x.txt')];
    expect(filterFilesByAcceptTypes(files, { 'application/pdf': ['.pdf'] })).toEqual([]);
  });
});

describe('describeAllowedFileKinds', () => {
  it('lists PDF and CSV when both allowed', () => {
    expect(
      describeAllowedFileKinds({
        'application/pdf': ['.pdf'],
        'text/csv': ['.csv'],
      })
    ).toBe('PDF or CSV');
  });
});

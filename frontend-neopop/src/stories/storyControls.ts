/** Shared Storybook control options for layout-related CSS values */

export const flexAlignItemsOptions = [
  'flex-start',
  'center',
  'flex-end',
  'stretch',
  'baseline',
] as const;

export const flexJustifyContentOptions = [
  'flex-start',
  'center',
  'flex-end',
  'space-between',
  'space-around',
  'space-evenly',
] as const;

export const flexWrapOptions = ['nowrap', 'wrap', 'wrap-reverse'] as const;

export const flexDirectionOptions = ['row', 'row-reverse', 'column', 'column-reverse'] as const;

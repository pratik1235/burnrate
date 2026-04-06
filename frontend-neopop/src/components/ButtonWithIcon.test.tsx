import { render } from '@testing-library/react';
import { Plus } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { ButtonWithIcon } from './ButtonWithIcon';

describe('ButtonWithIcon', () => {
  it('reflects gap prop on inner row data attribute and columnGap style', () => {
    const { container: c8 } = render(
      <ButtonWithIcon icon={Plus} gap={8} justifyContent="center">
        Eight
      </ButtonWithIcon>,
    );
    const { container: c24 } = render(
      <ButtonWithIcon icon={Plus} gap={24} justifyContent="center">
        TwentyFour
      </ButtonWithIcon>,
    );
    const row8 = c8.querySelector('[data-bwi-gap="8"]');
    const row24 = c24.querySelector('[data-bwi-gap="24"]');
    expect(row8).toBeTruthy();
    expect(row24).toBeTruthy();
    if (row8 instanceof HTMLElement && row8.style.columnGap) {
      expect(parseFloat(row8.style.columnGap)).toBe(8);
    }
    if (row24 instanceof HTMLElement && row24.style.columnGap) {
      expect(parseFloat(row24.style.columnGap)).toBe(24);
    }
  });
});

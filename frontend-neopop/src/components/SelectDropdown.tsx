import {
  Column,
  Dropdown,
  ElevatedCard,
  Typography,
} from '@cred/neopop-web/lib/components';
import { FontType, FontWeights } from '@cred/neopop-web/lib/components/Typography/types';
import { colorPalette, mainColors } from '@cred/neopop-web/lib/primitives';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import styled from 'styled-components';

/** Single selectable entry shown in the menu panel. */
export type SelectDropdownOption = {
  value: string;
  label: string;
};

/**
 * NeoPOP `Dropdown` color overrides (`border`, `text`, `chevron` strings).
 * Matches `@cred/neopop-web` `Dropdown` `colorConfig` shape.
 */
export type SelectDropdownTriggerColors = {
  border?: string;
  text?: string;
  chevron?: string;
};

export type SelectDropdownProps = {
  /** Choices shown when the menu is open. */
  options: SelectDropdownOption[];
  /** Currently selected value, if any. */
  value?: string;
  /** Called when the user picks an option. */
  onChange?: (next: string) => void;
  /** Trigger label when `value` is empty or not in `options`. */
  placeholder?: string;
  /** Disables opening the menu and dims the control. */
  disabled?: boolean;
  /** Passed to NeoPOP `Dropdown`. */
  colorMode?: 'dark' | 'light';
  /** Trigger chrome: border, label, and NeoPOP chevron colors. */
  colorConfig?: SelectDropdownTriggerColors;
  /** CSS margin on the outer wrapper (layout spacing in screens and Storybook). */
  margin?: CSSProperties['margin'];
  /** CSS padding on the outer wrapper. */
  padding?: CSSProperties['padding'];
  /** Extra styles for the outer wrapper. */
  wrapperStyle?: CSSProperties;
  /** className on the outer wrapper. */
  className?: string;
  /** Vertical gap between trigger and menu (px). */
  menuOffset?: number;
  /** Panel background (NeoPOP `ElevatedCard` `backgroundColor`). */
  menuBackgroundColor?: string;
  /** Optional elevated edge colors for the menu card. */
  menuEdgeColors?: { bottom: string; right: string };
  /** Menu panel minimum height (scroll when content exceeds). */
  menuMinWidth?: number | string;
  /** Menu panel maximum height with vertical scroll. */
  menuMaxHeight?: number | string;
};

const Root = styled.div<{ $disabled?: boolean }>`
  position: relative;
  display: inline-block;
  max-width: 100%;
  opacity: ${(p) => (p.$disabled ? 0.45 : 1)};
  pointer-events: ${(p) => (p.$disabled ? 'none' : 'auto')};
`;

const MenuPosition = styled.div<{ $offset: number }>`
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + ${(p) => p.$offset}px);
  z-index: 20;
`;

const OptionButton = styled.button`
  display: block;
  width: 100%;
  margin: 0;
  padding: 10px 14px;
  border: none;
  text-align: left;
  cursor: pointer;
  background: transparent;
  &:focus-visible {
    outline: 2px solid ${mainColors.yellow};
    outline-offset: -2px;
  }
  &:hover {
    background: ${colorPalette.popBlack[300]};
  }
`;

/**
 * NeoPOP-backed select: `Dropdown` trigger and `ElevatedCard` menu with `Typography` options.
 * Click-outside and Escape close the menu; `useEffect` listeners are always cleaned up.
 */
export function SelectDropdown({
  options,
  value,
  onChange,
  placeholder = 'Select',
  disabled = false,
  colorMode = 'dark',
  colorConfig,
  margin,
  padding,
  wrapperStyle,
  className,
  menuOffset = 6,
  menuBackgroundColor = colorPalette.popBlack[200],
  menuEdgeColors,
  menuMinWidth,
  menuMaxHeight = 280,
}: SelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => options.find((o) => o.value === value),
    [options, value],
  );
  const triggerLabel = selected?.label ?? placeholder;

  const toggle = useCallback(() => {
    if (disabled) return;
    setOpen((o) => !o);
  }, [disabled]);

  const pick = useCallback(
    (next: string) => {
      onChange?.(next);
      setOpen(false);
    },
    [onChange],
  );

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const root = rootRef.current;
      if (root && !root.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const menuStyle = useMemo((): CSSProperties => {
    const style: CSSProperties = {
      maxHeight: typeof menuMaxHeight === 'number' ? `${menuMaxHeight}px` : menuMaxHeight,
      overflowY: 'auto',
    };
    if (menuMinWidth != null) {
      style.minWidth = typeof menuMinWidth === 'number' ? `${menuMinWidth}px` : menuMinWidth;
    }
    return style;
  }, [menuMaxHeight, menuMinWidth]);

  const outerStyle = useMemo(
    (): CSSProperties => ({
      margin,
      padding,
      ...wrapperStyle,
    }),
    [margin, padding, wrapperStyle],
  );

  return (
    <Root
      ref={rootRef}
      $disabled={disabled}
      className={className}
      style={outerStyle}
      data-select-dropdown-open={open || undefined}
    >
      <Dropdown
        onClick={toggle}
        label={triggerLabel}
        colorMode={colorMode}
        colorConfig={colorConfig}
      />
      {open ? (
        <MenuPosition $offset={menuOffset} role="listbox">
          <ElevatedCard
            backgroundColor={menuBackgroundColor}
            edgeColors={menuEdgeColors}
            style={menuStyle}
            fullWidth
          >
            <Column style={{ gap: 0 }}>
              {options.map((opt) => {
                const active = opt.value === value;
                return (
                  <OptionButton
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => pick(opt.value)}
                  >
                    <Typography
                      as="span"
                      fontType={FontType.BODY}
                      fontSize={14}
                      fontWeight={active ? FontWeights.SEMI_BOLD : FontWeights.REGULAR}
                      color={active ? mainColors.white : 'rgba(255,255,255,0.7)'}
                    >
                      {opt.label}
                    </Typography>
                  </OptionButton>
                );
              })}
            </Column>
          </ElevatedCard>
        </MenuPosition>
      ) : null}
    </Root>
  );
}

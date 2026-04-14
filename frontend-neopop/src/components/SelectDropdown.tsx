import { Column, Dropdown, Typography } from '@cred/neopop-web/lib/components';
import {
  SelectableElevatedCard as ElevatedCard,
  TRANSPARENT_ELEVATED_CARD_EDGES,
} from '@/components/SelectableElevatedCard';
import { FontType, FontWeights } from '@cred/neopop-web/lib/components/Typography/types';
import { colorPalette, mainColors } from '@cred/neopop-web/lib/primitives';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
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

export type SelectDropdownSelectionMode = 'single' | 'multi';

export type SelectDropdownProps = {
  /** Choices shown when the menu is open. */
  options: SelectDropdownOption[];
  /** `single`: one value; `multi`: toggle set. Default `single`. */
  selectionMode?: SelectDropdownSelectionMode;
  /** Currently selected value (`selectionMode === 'single'`). */
  value?: string;
  /** Called when the user picks an option (`single`). */
  onChange?: (next: string) => void;
  /** Selected values (`selectionMode === 'multi'`). */
  selectedValues?: string[];
  /** Called when toggling options (`multi`). */
  onSelectedValuesChange?: (next: string[]) => void;
  /** Trigger label when `value` is empty or not in `options` (`single`). Also used as multi fallback when no `staticTriggerLabel`. */
  placeholder?: string;
  /** When set, trigger always shows this text (e.g. tag picker). */
  staticTriggerLabel?: string;
  /** When menu is open and `options` is empty, show this inside the panel. */
  emptyMenuContent?: ReactNode;
  /** Default: `true` for single, `false` for multi. */
  closeOnSelect?: boolean;
  /** `multi`: max selections; unselected options disabled at cap. */
  maxSelected?: number;
  /** `inline` under trigger; `portal` to `document.body` with fixed position. */
  menuMount?: 'inline' | 'portal';
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
  /** Menu panel minimum width (scroll when content exceeds). */
  menuMinWidth?: number | string;
  /** Menu panel maximum height with vertical scroll. */
  menuMaxHeight?: number | string;
  /** Accessibility label for the trigger control. */
  ariaLabel?: string;
  /** Fires on root `mousedown` (e.g. `stopPropagation` for nested clickable rows). */
  onRootMouseDown?: (e: React.MouseEvent) => void;
};

const Root = styled.div<{ $disabled?: boolean }>`
  position: relative;
  display: inline-block;
  max-width: 100%;
  opacity: ${(p) => (p.$disabled ? 0.45 : 1)};
  pointer-events: ${(p) => (p.$disabled ? 'none' : 'auto')};
`;

const TriggerWrap = styled.div`
  & > * {
    width: 100%;
    box-sizing: border-box;
  }
`;

const MenuPosition = styled.div<{ $offset: number }>`
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + ${(p) => p.$offset}px);
  z-index: 20;
`;

const OptionButton = styled.button<{ $disabledOption?: boolean }>`
  display: block;
  width: 100%;
  margin: 0;
  padding: 10px 14px;
  border: none;
  text-align: left;
  cursor: ${(p) => (p.$disabledOption ? 'not-allowed' : 'pointer')};
  background: transparent;
  opacity: ${(p) => (p.$disabledOption ? 0.45 : 1)};
  &:focus-visible {
    outline: 2px solid ${mainColors.yellow};
    outline-offset: -2px;
  }
  &:hover {
    background: ${(p) => (p.$disabledOption ? 'transparent' : colorPalette.popBlack[300])};
  }
`;

function defaultCloseOnSelect(mode: SelectDropdownSelectionMode, explicit?: boolean): boolean {
  if (explicit !== undefined) return explicit;
  return mode !== 'multi';
}

/**
 * NeoPOP-backed select: `Dropdown` trigger and `ElevatedCard` menu with `Typography` options.
 * Click-outside and Escape close the menu; `useEffect` listeners are always cleaned up.
 */
export function SelectDropdown({
  options,
  selectionMode = 'single',
  value,
  onChange,
  selectedValues = [],
  onSelectedValuesChange,
  placeholder = 'Select',
  staticTriggerLabel,
  emptyMenuContent,
  closeOnSelect: closeOnSelectProp,
  maxSelected,
  menuMount = 'inline',
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
  ariaLabel,
  onRootMouseDown,
}: SelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const portalMenuRef = useRef<HTMLDivElement>(null);
  const [portalBox, setPortalBox] = useState({ top: 0, left: 0, width: 0 });

  const isMulti = selectionMode === 'multi';
  const closeOnSelect = defaultCloseOnSelect(selectionMode, closeOnSelectProp);

  const selected = useMemo(
    () => (isMulti ? null : options.find((o) => o.value === value)),
    [options, value, isMulti],
  );

  const triggerLabel = useMemo(() => {
    if (staticTriggerLabel != null && staticTriggerLabel !== '') return staticTriggerLabel;
    if (isMulti) return placeholder;
    return selected?.label ?? placeholder;
  }, [staticTriggerLabel, isMulti, placeholder, selected?.label]);

  const updatePortalPosition = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPortalBox({
      top: r.bottom + menuOffset,
      left: r.left,
      width: Math.max(r.width, 140),
    });
  }, [menuOffset]);

  useLayoutEffect(() => {
    if (!open || menuMount !== 'portal') return;
    updatePortalPosition();
  }, [open, menuMount, updatePortalPosition]);

  useEffect(() => {
    if (!open || menuMount !== 'portal') return;
    const onScrollOrResize = () => updatePortalPosition();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, menuMount, updatePortalPosition]);

  const toggle = useCallback(() => {
    if (disabled) return;
    setOpen((o) => !o);
  }, [disabled]);

  const pickSingle = useCallback(
    (next: string) => {
      onChange?.(next);
      if (closeOnSelect) setOpen(false);
    },
    [onChange, closeOnSelect],
  );

  const toggleMulti = useCallback(
    (optValue: string) => {
      const has = selectedValues.includes(optValue);
      const atCap =
        maxSelected != null && selectedValues.length >= maxSelected && !has;
      if (atCap) return;
      const next = has
        ? selectedValues.filter((v) => v !== optValue)
        : [...selectedValues, optValue];
      onSelectedValuesChange?.(next);
      if (closeOnSelect) setOpen(false);
    },
    [selectedValues, onSelectedValuesChange, closeOnSelect, maxSelected],
  );

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const t = e.target as Node;
      const inRoot = rootRef.current?.contains(t);
      const inPortal = menuMount === 'portal' && portalMenuRef.current?.contains(t);
      if (!inRoot && !inPortal) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open, menuMount]);

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
      padding: 0,
      maxWidth: 'none',
      display: 'block',
      backgroundColor: 'transparent',
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

  const portalFixedStyle: CSSProperties = useMemo(
    () => ({
      position: 'fixed',
      top: portalBox.top,
      left: portalBox.left,
      width: portalBox.width,
      zIndex: 10000,
    }),
    [portalBox],
  );

  const showEmptyPanel = options.length === 0 && emptyMenuContent != null;
  const showOptionsList = options.length > 0;

  const menuInner = (
    <ElevatedCard
      backgroundColor={menuBackgroundColor}
      edgeColors={menuEdgeColors ?? TRANSPARENT_ELEVATED_CARD_EDGES}
      style={menuStyle}
      fullWidth
    >
      <Column style={{ gap: 0 }}>
        {showEmptyPanel ? (
          <div style={{ padding: '10px 14px' }}>{emptyMenuContent}</div>
        ) : null}
        {showOptionsList
          ? options.map((opt) => {
              const active = isMulti
                ? selectedValues.includes(opt.value)
                : opt.value === value;
              const disabledOption =
                isMulti &&
                maxSelected != null &&
                selectedValues.length >= maxSelected &&
                !selectedValues.includes(opt.value);
              return (
                <OptionButton
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={active}
                  disabled={disabledOption}
                  $disabledOption={disabledOption}
                  onClick={() => {
                    if (disabledOption) return;
                    if (isMulti) toggleMulti(opt.value);
                    else pickSingle(opt.value);
                  }}
                >
                  <Typography
                    as="span"
                    fontType={FontType.BODY}
                    fontSize={isMulti ? 12 : 14}
                    fontWeight={active ? FontWeights.SEMI_BOLD : FontWeights.REGULAR}
                    color={
                      disabledOption
                        ? 'rgba(255,255,255,0.3)'
                        : active
                          ? mainColors.white
                          : 'rgba(255,255,255,0.7)'
                    }
                  >
                    {isMulti ? (
                      <>
                        {active ? '✓ ' : ''}
                        {opt.label}
                      </>
                    ) : (
                      opt.label
                    )}
                  </Typography>
                </OptionButton>
              );
            })
          : null}
      </Column>
    </ElevatedCard>
  );

  const listbox =
    open && (showOptionsList || showEmptyPanel) ? (
      menuMount === 'portal' ? (
        <div ref={portalMenuRef} style={portalFixedStyle} role="listbox">
          {menuInner}
        </div>
      ) : (
        <MenuPosition $offset={menuOffset} role="listbox">
          {menuInner}
        </MenuPosition>
      )
    ) : null;

  const dropdownProps: Record<string, unknown> = {
    onClick: toggle,
    label: triggerLabel,
    colorMode,
    colorConfig,
  };
  if (ariaLabel) dropdownProps['aria-label'] = ariaLabel;

  return (
    <Root
      ref={rootRef}
      $disabled={disabled}
      className={className}
      style={outerStyle}
      data-select-dropdown-open={open || undefined}
      onMouseDown={onRootMouseDown}
    >
      {/* Hidden sizer: forces Root to be at least as wide as the widest option label.
          Padding mirrors the NeoPOP Dropdown trigger (10px 15px + ~22px chevron). */}
      <div
        aria-hidden
        style={{
          height: 0,
          overflow: 'hidden',
          pointerEvents: 'none',
        }}
      >
        {options.map((opt) => (
          <div key={opt.value} style={{ whiteSpace: 'nowrap', paddingLeft: 15, paddingRight: 37, fontSize: isMulti ? 12 : 14 }}>
            {opt.label}
          </div>
        ))}
        {placeholder && (
          <div style={{ whiteSpace: 'nowrap', paddingLeft: 15, paddingRight: 37, fontSize: isMulti ? 12 : 14 }}>
            {placeholder}
          </div>
        )}
      </div>
      <TriggerWrap>
        <Dropdown {...dropdownProps} />
      </TriggerWrap>
      {menuMount === 'portal' && listbox ? createPortal(listbox, document.body) : listbox}
    </Root>
  );
}

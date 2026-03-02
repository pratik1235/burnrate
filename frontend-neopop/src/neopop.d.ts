declare module '@cred/neopop-web/lib/components' {
  import type { ComponentType } from 'react';
  export const Button: ComponentType<any>;
  export const Typography: ComponentType<any>;
  export const ElevatedCard: ComponentType<any>;
  export const InputField: ComponentType<any>;
  export const Tag: ComponentType<any>;
  export const SearchBar: ComponentType<any>;
  export const Dropdown: ComponentType<any>;
  export const Row: ComponentType<any>;
  export const Column: ComponentType<any>;
  export const HorizontalSpacer: ComponentType<any>;
  export const VerticalSpacer: ComponentType<any>;
  export const showToast: (content: string, options?: {
    content?: string;
    description?: string;
    type?: 'success' | 'error' | 'warning';
    fullWidth?: boolean;
    dismissOnClick?: boolean;
    autoCloseTime?: number;
    icon?: string;
    colorConfig?: { background: string; color: string };
  }) => void;
  export const ToastContainer: ComponentType<any>;
}

declare module '@cred/neopop-web/lib/primitives' {
  export const colorPalette: {
    black: Record<number, string>;
    popBlack: Record<number, string>;
    rss: Record<number, string>;
    error: Record<number, string>;
    success: Record<number, string>;
    poliPurple: Record<number, string>;
    pinkPong: Record<number, string>;
    mannna: Record<number, string>;
    neoPaccha: Record<number, string>;
    yoyo: Record<number, string>;
    info: Record<number, string>;
    warning: Record<number, string>;
    skyBlue: Record<number, string>;
    aqua: Record<number, string>;
    goldRush: Record<number, string>;
    indigo: Record<number, string>;
    mint: Record<number, string>;
    brown: Record<number, string>;
    cyan: Record<number, string>;
    magenta: Record<number, string>;
    lavender: Record<number, string>;
    charcoal: Record<number, string>;
  };
  export const mainColors: {
    black: string;
    white: string;
    red: string;
    green: string;
    yellow: string;
    blue?: string;
  };
}

declare module '@cred/neopop-web/lib/components/Typography/types' {
  export enum FontType {
    HEADING = 'heading',
    CAPS = 'caps',
    BODY = 'body',
    SERIF_HEADING = 'serif-heading',
  }
  export enum FontWeights {
    EXTRA_BOLD = 800,
    BOLD = 700,
    SEMI_BOLD = 600,
    MEDIUM = 500,
    REGULAR = 400,
    THIN = 300,
  }
}

import { Typography } from '@cred/neopop-web/lib/components';
import { FontType, FontWeights } from '@cred/neopop-web/lib/components/Typography/types';
import type { Bank } from '@/lib/types';
import { BANK_CONFIG } from '@/lib/types';
import { findCardTemplate, getDefaultTemplate } from '@/lib/cardTemplates';
import styled from 'styled-components';

export interface CreditCardVisualProps {
  bank: Bank;
  last4: string;
  cardName?: string;
  totalSpend?: number;
  transactionCount?: number;
  onClick?: () => void;
  className?: string;
  size?: 'small' | 'medium' | 'large';
}

const SIZE_MAP = {
  small: { width: 240, height: 151 },
  medium: { width: 320, height: 201 },
  large: { width: 400, height: 252 },
};

const CardContainer = styled.div<{
  $width: number;
  $height: number;
  $gradient: string;
  $textColor: string;
  $accentColor: string;
  $clickable: boolean;
}>`
  position: relative;
  width: ${(p) => p.$width}px;
  height: ${(p) => p.$height}px;
  border-radius: 16px;
  background: ${(p) => p.$gradient};
  color: ${(p) => p.$textColor};
  overflow: hidden;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.15),
    0 4px 20px rgba(0, 0, 0, 0.3),
    0 1px 3px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  cursor: ${(p) => (p.$clickable ? 'pointer' : 'default')};
  padding: ${(p) => Math.round(p.$height * 0.12)}px ${(p) => Math.round(p.$width * 0.08)}px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(
      135deg,
      rgba(255, 255, 255, 0.12) 0%,
      transparent 50%,
      rgba(0, 0, 0, 0.05) 100%
    );
    pointer-events: none;
    border-radius: 16px;
  }

  &:hover {
    ${(p) =>
      p.$clickable &&
      `
      transform: scale(1.03);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.2),
        0 8px 32px rgba(0, 0, 0, 0.4),
        0 2px 8px rgba(0, 0, 0, 0.25);
    `}
  }
`;

const CardTop = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  position: relative;
  z-index: 1;
`;

const CardCenter = styled.div`
  position: relative;
  z-index: 1;
  margin: 8px 0;
`;

const CardBottom = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  position: relative;
  z-index: 1;
`;

const Chip = styled.div<{ $accentColor: string }>`
  width: 36px;
  height: 28px;
  border-radius: 6px;
  background: linear-gradient(
    135deg,
    ${(p) => p.$accentColor} 0%,
    rgba(255, 255, 255, 0.4) 50%,
    ${(p) => p.$accentColor} 100%
  );
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5), 0 1px 2px rgba(0, 0, 0, 0.3);
`;

const CardNumber = styled.span<{ $opacity: number }>`
  font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Mono', monospace;
  font-size: inherit;
  letter-spacing: 0.15em;
  opacity: ${(p) => p.$opacity};
`;

const NETWORK_LABELS: Record<string, string> = {
  visa: 'VISA',
  mastercard: 'Mastercard',
  rupay: 'RuPay',
  amex: 'AMEX',
  diners: 'Diners',
};

export function CreditCardVisual({
  bank,
  last4,
  cardName,
  totalSpend: _totalSpend,
  transactionCount: _transactionCount,
  onClick,
  className,
  size = 'medium',
}: CreditCardVisualProps) {
  const template = cardName ? findCardTemplate(bank, cardName) : getDefaultTemplate(bank);
  const resolvedTemplate = template ?? getDefaultTemplate(bank);
  const { width, height } = SIZE_MAP[size];
  const bankConfig = BANK_CONFIG[bank];

  const fontSize = size === 'small' ? 11 : size === 'medium' ? 13 : 15;
  const numberFontSize = size === 'small' ? 14 : size === 'medium' ? 17 : 20;

  return (
    <CardContainer
      $width={width}
      $height={height}
      $gradient={resolvedTemplate.gradient}
      $textColor={resolvedTemplate.textColor}
      $accentColor={resolvedTemplate.accentColor}
      $clickable={!!onClick}
      onClick={onClick}
      className={className}
    >
      <CardTop>
        <Typography
          fontType={FontType.BODY}
          fontSize={fontSize}
          fontWeight={FontWeights.SEMI_BOLD}
          color={resolvedTemplate.textColor}
          style={{ opacity: 0.95 }}
        >
          {bankConfig.name}
        </Typography>
        <Typography
          fontType={FontType.BODY}
          fontSize={fontSize - 1}
          fontWeight={FontWeights.REGULAR}
          color={resolvedTemplate.textColor}
          style={{ opacity: 0.9, letterSpacing: '0.05em' }}
        >
          {NETWORK_LABELS[resolvedTemplate.network] ?? resolvedTemplate.network.toUpperCase()}
        </Typography>
      </CardTop>

      <CardCenter>
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            flexWrap: 'wrap',
            fontSize: numberFontSize,
            color: resolvedTemplate.textColor,
          }}
        >
          <CardNumber $opacity={0.5}>XXXX</CardNumber>
          <CardNumber $opacity={0.5}>XXXX</CardNumber>
          <CardNumber $opacity={0.5}>XXXX</CardNumber>
          <CardNumber $opacity={1}>{last4}</CardNumber>
        </div>
      </CardCenter>

      <CardBottom>
        <Typography
          fontType={FontType.BODY}
          fontSize={fontSize - 1}
          fontWeight={FontWeights.BOLD}
          color={resolvedTemplate.textColor}
          style={{ opacity: 0.95, letterSpacing: '0.1em' }}
        >
          {resolvedTemplate.cardName.toUpperCase()}
        </Typography>
        <Chip $accentColor={resolvedTemplate.accentColor} />
      </CardBottom>
    </CardContainer>
  );
}

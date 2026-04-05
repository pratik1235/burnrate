import { Button, Typography } from '@cred/neopop-web/lib/components';
import { colorPalette, mainColors } from '@cred/neopop-web/lib/primitives';
import { FontType, FontWeights } from '@cred/neopop-web/lib/components/Typography/types';
import { Settings } from 'lucide-react';
import { SyncStatus } from '@/components/SyncStatus';

interface NavbarProps {
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  className?: string;
}

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'cards', label: 'Cards' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'statements', label: 'Statements' },
  { id: 'offers', label: 'Offers' },
  { id: 'milestones', label: 'Milestones' },
  { id: 'customize', label: 'Customize' },
];

export function Navbar({ activeTab = 'dashboard', onTabChange, className }: NavbarProps) {
  return (
    <nav
      style={{
        backgroundColor: colorPalette.black[100],
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        padding: '0 24px',
        height: 56,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }}
      className={className}
    >
      <div style={{ position: 'absolute', left: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
        <img src="/burnrate-logo.svg" alt="" width={24} height={24} style={{ display: 'block' }} />
        <Typography fontType={FontType.BODY} fontSize={16} fontWeight={FontWeights.BOLD} color={mainColors.white} style={{ letterSpacing: '-0.02em' }}>
          burnrate
        </Typography>
      </div>

      <div style={{ display: 'flex', gap: 4 }}>
        {TABS.map((tab) => (
          <Button
            key={tab.id}
            kind="elevated"
            size="small"
            colorMode="dark"
            variant={activeTab === tab.id ? 'secondary' : 'primary'}
            onClick={() => onTabChange?.(tab.id)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      <div
        style={{
          position: 'absolute',
          right: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <SyncStatus />
        <Button
          kind="elevated"
          size="small"
          colorMode="dark"
          variant="primary"
          onClick={() => onTabChange?.('setup')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 36,
            height: 36,
            color: 'rgba(255,255,255,0.6)',
            backgroundColor: 'rgba(255,255,255,0.05)',
            padding: 0,
          }}
        >
          <Settings size={18} />
        </Button>
      </div>
    </nav>
  );
}

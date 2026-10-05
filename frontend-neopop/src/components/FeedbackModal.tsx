import { useState } from 'react';
import { Typography, Button } from '@cred/neopop-web/lib/components';
import { SelectableElevatedCard as ElevatedCard, TRANSPARENT_ELEVATED_CARD_EDGES } from '@/components/SelectableElevatedCard';
import { FontType, FontWeights } from '@cred/neopop-web/lib/components/Typography/types';
import { colorPalette, mainColors } from '@cred/neopop-web/lib/primitives';
import { toast } from '@/components/Toast';
import { CloseButton } from '@/components/CloseButton';
import styled from 'styled-components';
import { submitFeedback } from '@/lib/api';

const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 10vh;
`;

const ModalBackdrop = styled.div`
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
`;

const TextArea = styled.textarea`
  width: 100%;
  background-color: ${colorPalette.black[100]};
  color: ${mainColors.white};
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  padding: 12px;
  font-family: inherit;
  font-size: 14px;
  resize: vertical;
  min-height: 160px; /* ~8 lines */
  &:focus {
    outline: none;
    border-color: ${colorPalette.rss[400]};
  }
`;

export function FeedbackModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const handleClose = () => {
    setText('');
    onClose();
  };

  const handleSubmit = async () => {
    if (!text.trim()) {
      toast.error('Feedback cannot be empty');
      return;
    }
    if (text.length > 500) {
      toast.error('Feedback must be less than 500 characters');
      return;
    }

    setSubmitting(true);
    try {
      await submitFeedback(text);
      toast.success('Feedback submitted successfully!');
      handleClose();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || e.message || 'Failed to submit feedback');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalOverlay>
      <ModalBackdrop onClick={handleClose} />
      <ElevatedCard
        backgroundColor={colorPalette.black[90]}
        edgeColors={TRANSPARENT_ELEVATED_CARD_EDGES}
        style={{
          padding: 0,
          position: 'relative',
          width: '100%',
          maxWidth: 480,
          display: 'block',
          backgroundColor: 'transparent',
          boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <Typography fontType={FontType.BODY} fontSize={18} fontWeight={FontWeights.BOLD} color={mainColors.white}>
            Feedback / Bugs / Feature Request
          </Typography>
          <CloseButton onClick={handleClose} variant="modal" />
        </div>

        <div style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <Typography fontType={FontType.BODY} fontSize={13} color="rgba(255,255,255,0.7)">
              Please describe your feedback, bug, or feature request.
            </Typography>
          </div>

          <TextArea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type your feedback here..."
            maxLength={500}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
            <Typography fontType={FontType.BODY} fontSize={13} color={text.length > 500 ? colorPalette.error[500] : "rgba(255,255,255,0.5)"}>
              {text.length} / 500 max characters
            </Typography>

            <div style={{ display: 'flex', gap: '8px' }}>
              <Button
                variant="primary"
                kind="elevated"
                colorMode="dark"
                onClick={handleSubmit}
                // disabled={submitting || text.trim().length === 0 || text.length > 500}
                style={{
                  background: 'none',
                  border: 'none',
                }}
              >
                {submitting ? 'Submitting...' : 'OK'}
              </Button>
              {/* <div style={{ width: '4px' }} /> */}
              <Button
                variant="secondary"
                kind="elevated"
                colorMode="dark"
                onClick={handleClose}
                disabled={submitting}
                style={{
                  background: 'none',
                  border: 'none',
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </ElevatedCard>
    </ModalOverlay >
  );
}

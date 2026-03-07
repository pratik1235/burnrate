/**
 * Gmail API service — OAuth2 + statement PDF fetching.
 *
 * Uses Google Identity Services (GIS) for OAuth and raw fetch() calls
 * to the Gmail REST API. No SDK bundle required.
 *
 * Privacy: The access token lives in memory only (never persisted).
 * The browser talks directly to Gmail — no intermediary server.
 */

import { GOOGLE_CLIENT_ID, BANK_EMAIL_CONFIGS } from '../lib/config.js';

// ── Types ────────────────────────────────────────────────────

interface TokenClient {
  requestAccessToken: (opts?: { prompt?: string }) => void;
  callback: (resp: TokenResponse) => void;
}

interface TokenResponse {
  access_token?: string;
  error?: string;
}

interface GmailMessage {
  id: string;
  threadId: string;
}

interface GmailMessageDetail {
  id: string;
  payload: {
    parts?: GmailPart[];
    mimeType: string;
    body?: { attachmentId?: string; size?: number; data?: string };
    headers?: { name: string; value: string }[];
  };
  internalDate?: string;
}

interface GmailPart {
  mimeType: string;
  filename?: string;
  body?: { attachmentId?: string; size?: number; data?: string };
  parts?: GmailPart[];
}

export interface FetchedStatement {
  file: File;
  bank: string;
  emailDate: string;
}

// ── State ────────────────────────────────────────────────────

let accessToken: string | null = null;
let tokenClient: TokenClient | null = null;
let gisLoaded = false;

// ── GIS Loader ───────────────────────────────────────────────

function waitForGis(): Promise<void> {
  if (gisLoaded && (window as any).google?.accounts?.oauth2) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const maxWait = 10_000;
    const start = Date.now();
    const check = () => {
      if ((window as any).google?.accounts?.oauth2) {
        gisLoaded = true;
        resolve();
      } else if (Date.now() - start > maxWait) {
        reject(new Error('Google Identity Services script did not load. Check your internet connection.'));
      } else {
        setTimeout(check, 200);
      }
    };
    check();
  });
}

// ── Public API ───────────────────────────────────────────────

/**
 * Initialize the OAuth2 token client.
 * Call once on app startup or before first sign-in.
 */
export async function initGmailAuth(): Promise<void> {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error('GOOGLE_CLIENT_ID is not configured. Set it in src/lib/config.js');
  }
  await waitForGis();

  const google = (window as any).google;
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/gmail.readonly',
    callback: () => {}, // overridden at sign-in time
  });
}

/**
 * Trigger the Google OAuth consent popup.
 * Returns the access token on success.
 */
export function signIn(): Promise<string> {
  return new Promise(async (resolve, reject) => {
    if (!tokenClient) {
      try {
        await initGmailAuth();
      } catch (e) {
        reject(e);
        return;
      }
    }

    tokenClient!.callback = (resp: TokenResponse) => {
      if (resp.error) {
        reject(new Error(`OAuth error: ${resp.error}`));
        return;
      }
      if (resp.access_token) {
        accessToken = resp.access_token;
        resolve(resp.access_token);
      } else {
        reject(new Error('No access token received'));
      }
    };

    tokenClient!.requestAccessToken({ prompt: 'consent' });
  });
}

/**
 * Revoke the current token and clear state.
 */
export function signOut(): void {
  if (accessToken && (window as any).google?.accounts?.oauth2) {
    (window as any).google.accounts.oauth2.revoke(accessToken);
  }
  accessToken = null;
}

/**
 * Check if there's an active access token.
 */
export function isSignedIn(): boolean {
  return !!accessToken;
}

// ── Gmail API helpers ────────────────────────────────────────

const GMAIL_API = 'https://www.googleapis.com/gmail/v1/users/me';

async function gmailFetch<T>(path: string): Promise<T> {
  if (!accessToken) throw new Error('Not authenticated');
  const res = await fetch(`${GMAIL_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401) {
    accessToken = null;
    throw new Error('Session expired. Please sign in again.');
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Gmail API error ${res.status}: ${body}`);
  }
  return res.json();
}

/**
 * Build a Gmail search query for a bank config.
 */
function buildQuery(bank: { name: string; domains: string[] }): string {
  const fromPart =
    bank.domains.length === 1
      ? `from:${bank.domains[0]}`
      : `(${bank.domains.map((d) => `from:${d}`).join(' OR ')})`;
  return `${fromPart} has:attachment filename:pdf subject:(statement OR e-statement)`;
}

/**
 * Recursively find PDF attachments in a message payload.
 */
function findPdfParts(part: GmailPart): { filename: string; attachmentId: string }[] {
  const results: { filename: string; attachmentId: string }[] = [];

  if (
    part.filename &&
    part.filename.toLowerCase().endsWith('.pdf') &&
    part.body?.attachmentId
  ) {
    results.push({ filename: part.filename, attachmentId: part.body.attachmentId });
  }

  if (part.parts) {
    for (const child of part.parts) {
      results.push(...findPdfParts(child));
    }
  }

  return results;
}

/**
 * Decode base64url to Uint8Array.
 */
function base64urlToBytes(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ── Main fetch function ──────────────────────────────────────

export interface FetchProgress {
  phase: 'searching' | 'downloading';
  bank: string;
  current: number;
  total: number;
}

/**
 * Search Gmail for credit card statement PDFs and download them.
 *
 * @param onProgress - Optional callback for progress updates
 * @param maxResults - Max emails to search per bank (default 20)
 * @returns Array of File objects ready for processStatement()
 */
export async function fetchStatements(
  onProgress?: (progress: FetchProgress) => void,
  maxResults = 20,
): Promise<FetchedStatement[]> {
  if (!accessToken) throw new Error('Not authenticated. Call signIn() first.');

  const results: FetchedStatement[] = [];
  const seenMessageIds = new Set<string>();

  for (const bankConfig of BANK_EMAIL_CONFIGS) {
    const query = buildQuery(bankConfig);

    onProgress?.({
      phase: 'searching',
      bank: bankConfig.name,
      current: 0,
      total: 0,
    });

    // Search for messages
    let messageIds: string[] = [];
    try {
      const searchResult = await gmailFetch<{
        messages?: GmailMessage[];
        resultSizeEstimate?: number;
      }>(`/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`);

      messageIds = (searchResult.messages || [])
        .map((m) => m.id)
        .filter((id) => !seenMessageIds.has(id));
    } catch (err) {
      console.warn(`Gmail search failed for ${bankConfig.name}:`, err);
      continue;
    }

    if (!messageIds.length) continue;

    // Fetch each message and download PDF attachments
    for (let i = 0; i < messageIds.length; i++) {
      seenMessageIds.add(messageIds[i]);

      onProgress?.({
        phase: 'downloading',
        bank: bankConfig.name,
        current: i + 1,
        total: messageIds.length,
      });

      try {
        const msg = await gmailFetch<GmailMessageDetail>(
          `/messages/${messageIds[i]}?format=full`,
        );

        // Get email date for naming
        const dateHeader = msg.payload.headers?.find(
          (h) => h.name.toLowerCase() === 'date',
        );
        const emailDate = dateHeader?.value
          ? new Date(dateHeader.value).toISOString().slice(0, 10)
          : new Date(Number(msg.internalDate)).toISOString().slice(0, 10);

        // Find PDF attachments
        const pdfParts = findPdfParts(msg.payload as GmailPart);

        for (const pdfPart of pdfParts) {
          try {
            const attachment = await gmailFetch<{ data: string; size: number }>(
              `/messages/${messageIds[i]}/attachments/${pdfPart.attachmentId}`,
            );

            const bytes = base64urlToBytes(attachment.data);
            const file = new File(
              [bytes.buffer as ArrayBuffer],
              `${bankConfig.name}_${emailDate}_${pdfPart.filename}`,
              { type: 'application/pdf' },
            );

            results.push({
              file,
              bank: bankConfig.name.toLowerCase(),
              emailDate,
            });
          } catch (attachErr) {
            console.warn(
              `Failed to download attachment ${pdfPart.filename} from ${bankConfig.name}:`,
              attachErr,
            );
          }
        }
      } catch (msgErr) {
        console.warn(`Failed to fetch message ${messageIds[i]}:`, msgErr);
      }
    }
  }

  return results;
}

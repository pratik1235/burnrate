#!/usr/bin/env node
/**
 * Render all screenshots via Remotion stills (1280×800, mock data).
 *
 * Usage:
 *   cd video && node ../assets/verify-screenshots.mjs
 *
 * Each composition renders a single frame of the frontend page at the
 * correct mock-data phase. No live server required.
 
* to run : 
source venv313/bin/activate
pip install playwright
playwright install chromium
source venv313/bin/activate && python take_screenshots.py

*/
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const videoFolder = existsSync(resolve(__dirname, '..', 'burnrate-video')) ? 'burnrate-video' : 'video';
const VIDEO_DIR = resolve(__dirname, '..', videoFolder);
const OUT_DIR = resolve(__dirname, '.');

const SHOTS = [
  { id: 'ss-Dashboard', file: 'screenshot_dashboard.png' },
  { id: 'ss-Statements', file: 'screenshot_statements.png' },
  { id: 'ss-Transactions', file: 'screenshot_transactions.png' },
  { id: 'ss-Analytics', file: 'screenshot_analytics.png' },
  { id: 'ss-Cards', file: 'screenshot_cards.png' },
  { id: 'ss-Offers', file: 'screenshot_offers.png' },
  { id: 'ss-Milestones', file: 'screenshot_milestones.png' },
  { id: 'ss-Customize', file: 'screenshot_customize.png' },
  { id: 'ss-Categories', file: 'screenshot_categories_modal.png' },
  { id: 'ss-Filters', file: 'screenshot_filters.png' },
  { id: 'ss-Setup', file: 'screenshot_setup.png' },
];

for (const { id, file } of SHOTS) {
  const out = join(OUT_DIR, file);
  console.log(`Rendering ${id} → ${file} ...`);
  try {
    execSync(`npx remotion still ${id} "${out}"`, { cwd: VIDEO_DIR, stdio: 'inherit' });
    console.log(`  ✓ ${file}`);
  } catch (e) {
    console.error(`  ✗ ${file} failed`);
    process.exitCode = 1;
  }
}

console.log('\nDone.');

/**
 * Burnrate - Credit Card Statement Auto-Downloader
 * Google Apps Script that searches Gmail for credit card statement PDFs
 * and saves them to an organized Google Drive folder structure.
 *
 * Setup:
 * 1. Open script.google.com and create a new project
 * 2. Paste this code into Code.gs
 * 3. Run setupTrigger() once to create the 15-day trigger
 * 4. Grant Gmail and Drive permissions when prompted
 *
 * Date window: optional Script Properties lastRunTimestamp (`after:`) and beforeDate
 * (`before:`). If beforeDate is unset, main() uses today + 15 days as the upper bound
 * (helps manual backfills). Run printLastRunStats() for anchors and triggers.
 *
 * Folder structure: Statements/<BankName>/YYYY-MM/<BANK_CC_YYYY-MM.pdf>
 */

const BANK_CONFIGS = [
  { name: 'HDFC', domains: ['@hdfcbank.net'] },
  { name: 'ICICI', domains: ['@icicibank.com'] },
  { name: 'Axis', domains: ['@axisbank.com'] },
  { name: 'SBI', domains: ['@sbicard.com'] },
  { name: 'Amex', domains: ['@americanexpress.co.in', '@aexp.com'] },
  { name: 'IDFC_FIRST', domains: ['@idfcfirstbank.com'] },
  { name: 'IndusInd', domains: ['@indusind.com'] },
  { name: 'Kotak', domains: ['@kotak.com', '@kotakbank.com'] },
  { name: 'SC', domains: ['@sc.com'] },
  { name: 'YES', domains: ['@yesbank.in'] },
  { name: 'AU', domains: ['@aubank.in'] },
  { name: 'RBL', domains: ['@rblbank.com'] },
  { name: 'Federal', domains: ['@federalbank.co.in'] },
  { name: 'Indian_Bank', domains: ['@indianbank.co.in', '@indianbank.net.in'] },
];

const ROOT_FOLDER_NAME = 'Statements';
const PROPS_KEY_TIMESTAMP = 'lastRunTimestamp';
const PROPS_KEY_BEFORE_DATE = 'beforeDate';
const PROPS_KEY_PROCESSED = 'processedMessageIds';
const MAX_PROCESSED_IDS = 1000; // Limit to avoid Script Properties size limit (~9KB)

/** HDFC combined digest — not treated as per-card statement PDFs. */
const HDFC_SKIP_STATEMENT_SUBJECT = 'HDFC Bank Combined Email Statement';

/**
 * True if the message is the HDFC combined statement email (strips leading Re:/Fwd:, case-insensitive).
 * @param {string} subject
 * @returns {boolean}
 */
function isHdfcCombinedEmailStatementSubject(subject) {
  let s = (subject || '').trim();
  while (/^(re|fwd)\s*:\s*/i.test(s)) {
    s = s.replace(/^(re|fwd)\s*:\s*/i, '').trim();
  }
  return s.toLowerCase() === HDFC_SKIP_STATEMENT_SUBJECT.toLowerCase();
}

/**
 * Entry point. For each bank config, build Gmail query, search, process results.
 */
function main() {
  const props = PropertiesService.getScriptProperties();
  const afterDate = props.getProperty(PROPS_KEY_TIMESTAMP);
  const beforeDateEffective = getEffectiveBeforeDate(props);
  const beforeStored = props.getProperty(PROPS_KEY_BEFORE_DATE);
  const rootFolder = getRootFolder();
  let processedIds = getProcessedIds();

  Logger.log(
    'Burnrate statement downloader started. afterDate=' +
      (afterDate || 'none (full history)') +
      ' beforeDate=' +
      beforeDateEffective +
      (beforeStored ? ' (from script property)' : ' (default: today + 15 days)')
  );

  for (let i = 0; i < BANK_CONFIGS.length; i++) {
    const bankConfig = BANK_CONFIGS[i];
    try {
      const query = buildQuery(bankConfig, afterDate, beforeDateEffective);
      Logger.log('[' + bankConfig.name + '] Query: ' + query);

      const threads = GmailApp.search(query, 0, 100);

      for (let t = 0; t < threads.length; t++) {
        const messages = threads[t].getMessages();
        for (let m = 0; m < messages.length; m++) {
          const msg = messages[m];
          if (processedIds.indexOf(msg.getId()) >= 0) {
            continue;
          }
          processMessage(msg, bankConfig, rootFolder, processedIds);
        }
      }
    } catch (e) {
      Logger.log('[' + bankConfig.name + '] Error: ' + e.toString());
      console.error('Bank ' + bankConfig.name + ' failed:', e);
    }
  }

  saveProcessedIds(processedIds);
  props.setProperty(PROPS_KEY_TIMESTAMP, formatDate(new Date()));
  Logger.log('Burnrate statement downloader finished.');
}

/**
 * Upper bound for Gmail `before:` when PROPS_KEY_BEFORE_DATE is unset: today + 15 days (script TZ).
 * @returns {string} YYYY/MM/DD
 */
function getDefaultBeforeDateString() {
  const d = new Date();
  d.setDate(d.getDate() + 15);
  return formatDate(d);
}

/**
 * Stored beforeDate, or default window end for backfills / incremental runs.
 * @param {GoogleAppsScript.Properties.Properties} props
 * @returns {string} YYYY/MM/DD
 */
function getEffectiveBeforeDate(props) {
  const stored = props.getProperty(PROPS_KEY_BEFORE_DATE);
  if (stored && String(stored).trim()) {
    return String(stored).trim();
  }
  return getDefaultBeforeDateString();
}

/**
 * Build Gmail search string.
 * @param {Object} bankConfig - { name, domains }
 * @param {string|null} afterDate - YYYY/MM/DD or null for no lower bound
 * @param {string} beforeDate - YYYY/MM/DD for upper bound (typically exclusive in Gmail)
 * @returns {string} Gmail search query
 */
function buildQuery(bankConfig, afterDate, beforeDate) {
  const fromPart = bankConfig.domains.length === 1
    ? 'from:' + bankConfig.domains[0]
    : '(' + bankConfig.domains.map(function (d) { return 'from:' + d; }).join(' OR ') + ')';
  let query = fromPart + ' has:attachment filename:pdf subject:(statement OR e-statement)';
  if (afterDate) {
    query += ' after:' + afterDate;
  }
  if (beforeDate) {
    query += ' before:' + beforeDate;
  }
  return query;
}

/**
 * Get or create a subfolder under parent.
 * @param {GoogleAppsScript.Drive.Folder} parent
 * @param {string} name
 * @returns {GoogleAppsScript.Drive.Folder}
 */
function getOrCreateFolder(parent, name) {
  const iter = parent.getFoldersByName(name);
  if (iter.hasNext()) {
    return iter.next();
  }
  return parent.createFolder(name);
}

/**
 * Get or create the Statements root folder in Drive.
 * @returns {GoogleAppsScript.Drive.Folder}
 */
function getRootFolder() {
  const root = DriveApp.getRootFolder();
  return getOrCreateFolder(root, ROOT_FOLDER_NAME);
}

/**
 * Extract PDF attachments from message, save to Drive.
 * @param {GoogleAppsScript.Gmail.GmailMessage} message
 * @param {Object} bankConfig
 * @param {GoogleAppsScript.Drive.Folder} rootFolder
 * @param {string[]} processedIds - mutated: new IDs appended
 */
function processMessage(message, bankConfig, rootFolder, processedIds) {
  const msgId = message.getId();

  if (bankConfig.name === 'HDFC' && isHdfcCombinedEmailStatementSubject(message.getSubject())) {
    Logger.log('Skipping HDFC combined email statement (no Drive save): ' + msgId);
    processedIds.push(msgId);
    return;
  }

  const attachments = message.getAttachments();
  const date = message.getDate();
  const yearMonth = Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM');

  let savedCount = 0;
  const bankFolder = getOrCreateFolder(rootFolder, bankConfig.name);
  const monthFolder = getOrCreateFolder(bankFolder, yearMonth);
  const baseName = bankConfig.name + '_CC_' + yearMonth;

  for (let i = 0; i < attachments.length; i++) {
    const att = attachments[i];
    const name = att.getName() || '';
    const contentType = (att.getContentType() || '').toLowerCase();
    const isPdf = name.toLowerCase().endsWith('.pdf') || contentType.indexOf('pdf') >= 0;
    if (!isPdf) continue;

    // Find next available filename (HDFC_CC_2026-02.pdf, HDFC_CC_2026-02_2.pdf, ...)
    let finalName = baseName + '.pdf';
    let idx = 1;
    while (monthFolder.getFilesByName(finalName).hasNext()) {
      idx++;
      finalName = baseName + '_' + idx + '.pdf';
    }

    try {
      const file = monthFolder.createFile(att);
      file.setName(finalName);
      savedCount++;
      Logger.log('Saved: ' + bankConfig.name + '/' + yearMonth + '/' + finalName);
    } catch (e) {
      Logger.log('Failed to save ' + finalName + ': ' + e.toString());
    }
  }

  if (savedCount > 0) {
    processedIds.push(msgId);
  }
}

/**
 * Load processed message IDs from Script Properties.
 * @returns {string[]}
 */
function getProcessedIds() {
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty(PROPS_KEY_PROCESSED);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

/**
 * Save processed message IDs to Script Properties.
 * Keeps only last MAX_PROCESSED_IDS to avoid size limit.
 * @param {string[]} ids
 */
function saveProcessedIds(ids) {
  if (ids.length === 0) return;
  const trimmed = ids.length > MAX_PROCESSED_IDS
    ? ids.slice(-MAX_PROCESSED_IDS)
    : ids;
  const props = PropertiesService.getScriptProperties();
  props.setProperty(PROPS_KEY_PROCESSED, JSON.stringify(trimmed));
}

/**
 * Create a time-based trigger that runs every 15 days.
 * Deletes existing triggers first to avoid duplicates.
 */
function setupTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'main') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('main')
    .timeBased()
    .everyDays(15)
    .create();
  Logger.log('Trigger created: main() runs every 15 days.');
}

/**
 * Format date as YYYY/MM/DD for Gmail query.
 * @param {Date} date
 * @returns {string}
 */
function formatDate(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy/MM/dd');
}

/**
 * Writes PROPS_KEY_TIMESTAMP (YYYY/MM/DD in script timezone).
 * The next main() run uses this as Gmail `after:` — same field main() updates when it finishes.
 * @param {Date=} when - Omit to use the current time.
 */
function updateLastRunTimestamp(when) {
  const d = when instanceof Date ? when : new Date();
  const value = formatDate(d);
  PropertiesService.getScriptProperties().setProperty(PROPS_KEY_TIMESTAMP, value);
  Logger.log(PROPS_KEY_TIMESTAMP + ' set to ' + value);
}

/**
 * Sets optional Gmail `before:` upper bound (YYYY/MM/DD in script timezone).
 * Omit or call clearBeforeDate() to use the default (today + 15 days).
 * @param {Date=} when
 */
function updateBeforeDate(when) {
  const d = when instanceof Date ? when : new Date();
  const value = formatDate(d);
  PropertiesService.getScriptProperties().setProperty(PROPS_KEY_BEFORE_DATE, value);
  Logger.log(PROPS_KEY_BEFORE_DATE + ' set to ' + value);
}

/**
 * Removes stored beforeDate so main() uses the rolling default (today + 15 days).
 */
function clearBeforeDate() {
  PropertiesService.getScriptProperties().deleteProperty(PROPS_KEY_BEFORE_DATE);
  Logger.log(PROPS_KEY_BEFORE_DATE + ' cleared; main() will use today + 15 days.');
}

/**
 * Resets lastRunTimestamp to 2022/01/01, clears processed message IDs and optional beforeDate.
 * Use before a historical backfill; then set after/before via updateLastRunTimestamp / updateBeforeDate if needed.
 */
function cleanupBackfillState() {
  const props = PropertiesService.getScriptProperties();
  props.setProperty(PROPS_KEY_TIMESTAMP, '2022/01/01');
  props.deleteProperty(PROPS_KEY_PROCESSED);
  props.deleteProperty(PROPS_KEY_BEFORE_DATE);
  Logger.log(
    'cleanupBackfillState: ' +
      PROPS_KEY_TIMESTAMP +
      ' = 2022/01/01, cleared ' +
      PROPS_KEY_PROCESSED +
      ' and ' +
      PROPS_KEY_BEFORE_DATE +
      '.'
  );
}

/**
 * Logs persisted state from Script Properties (not OS env vars — Apps Script has none).
 * Run from the editor (select printLastRunStats → Run) and open View → Execution log.
 */
function printLastRunStats() {
  const tz = Session.getScriptTimeZone();
  const props = PropertiesService.getScriptProperties();
  const lastTs = props.getProperty(PROPS_KEY_TIMESTAMP);
  const beforeStored = props.getProperty(PROPS_KEY_BEFORE_DATE);
  const beforeEffective = getEffectiveBeforeDate(props);
  const processedRaw = props.getProperty(PROPS_KEY_PROCESSED);

  let processedIds = [];
  let processedParseError = null;
  if (processedRaw) {
    try {
      const parsed = JSON.parse(processedRaw);
      processedIds = Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      processedParseError = e.toString();
    }
  }

  const lines = [
    '=== Burnrate last-run stats ===',
    'Script timezone: ' + tz,
    PROPS_KEY_TIMESTAMP + ': ' + (lastTs || '(empty — next main() uses no after: lower bound)'),
    PROPS_KEY_BEFORE_DATE +
      ' (stored): ' +
      (beforeStored && String(beforeStored).trim() ? beforeStored.trim() : '(unset — default upper bound is today + 15 days)'),
    'beforeDate (effective for next main): ' +
      beforeEffective +
      (!beforeStored || !String(beforeStored).trim() ? ' (computed)' : ''),
    PROPS_KEY_PROCESSED + ': ' + processedIds.length + ' id(s) stored (cap ' + MAX_PROCESSED_IDS + ')',
  ];
  if (processedParseError) {
    lines.push('processedMessageIds JSON parse error: ' + processedParseError);
  } else if (processedIds.length > 0) {
    const head = processedIds.slice(0, 3).join(', ');
    const tail = processedIds.length > 3
      ? processedIds.slice(-3).join(', ')
      : '';
    lines.push('First IDs (up to 3): ' + head);
    if (processedIds.length > 3) {
      lines.push('Last IDs (up to 3): ' + tail);
    }
  }

  const triggers = ScriptApp.getProjectTriggers();
  const mainTriggers = [];
  for (let i = 0; i < triggers.length; i++) {
    const tr = triggers[i];
    if (tr.getHandlerFunction() === 'main') {
      mainTriggers.push(
        tr.getUniqueId() + ' | ' + tr.getTriggerSource() + ' | ' + JSON.stringify(tr.getTriggerSourceId())
      );
    }
  }
  lines.push('Triggers for main(): ' + (mainTriggers.length ? mainTriggers.length : 0));
  for (let j = 0; j < mainTriggers.length; j++) {
    lines.push('  ' + mainTriggers[j]);
  }

  const blob = lines.join('\n');
  Logger.log(blob);
  if (typeof console !== 'undefined' && console.log) {
    console.log(blob);
  }
}

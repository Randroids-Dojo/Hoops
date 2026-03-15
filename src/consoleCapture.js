// Captures console.warn/error and uncaught exceptions for feedback reports

const MAX_ENTRIES = 50;
const MAX_MESSAGE_LENGTH = 1000;

const entries = [];
let initialized = false;

function pushEntry(level, args) {
  let message = args
    .map((a) => {
      try {
        return typeof a === 'string' ? a : JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(' ');

  if (message.length > MAX_MESSAGE_LENGTH) {
    message = message.slice(0, MAX_MESSAGE_LENGTH) + '\u2026';
  }

  entries.push({ level, message, timestamp: new Date().toISOString() });
  if (entries.length > MAX_ENTRIES) entries.shift();
}

export function initConsoleCapture() {
  if (initialized) return;
  initialized = true;

  const origError = console.error;
  const origWarn = console.warn;

  console.error = (...args) => {
    pushEntry('error', args);
    origError.apply(console, args);
  };

  console.warn = (...args) => {
    pushEntry('warn', args);
    origWarn.apply(console, args);
  };

  window.addEventListener('error', (e) => {
    pushEntry('uncaught', [e.message, e.filename, e.lineno].filter(Boolean));
  });

  window.addEventListener('unhandledrejection', (e) => {
    pushEntry('uncaught', ['Unhandled rejection:', e.reason]);
  });
}

export function getCapturedLogs() {
  return [...entries];
}

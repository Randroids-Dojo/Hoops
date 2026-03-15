// Feedback FAB (Floating Action Button) - DOM-based overlay
// Shows when game is paused, allows players to submit feedback as GitHub issues.

import { initConsoleCapture, getCapturedLogs } from './consoleCapture.js';

let view = 'closed'; // 'closed' | 'menu' | 'feedback'
let submitState = 'idle'; // 'idle' | 'sending' | 'success' | 'error'
let fabEl, menuEl, panelEl, textareaEl, submitBtn, successEl, formEl;
let visible = false;

function captureScreenshot() {
  try {
    const canvas = document.getElementById('gameCanvas');
    if (!canvas || canvas.width === 0 || canvas.height === 0) return null;

    const maxWidth = 320;
    const scale = Math.min(1, maxWidth / canvas.width);
    const w = Math.round(canvas.width * scale);
    const h = Math.round(canvas.height * scale);

    const tmp = document.createElement('canvas');
    tmp.width = w;
    tmp.height = h;
    const ctx = tmp.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(canvas, 0, 0, w, h);
    return tmp.toDataURL('image/jpeg', 0.5);
  } catch {
    return null;
  }
}

function setView(newView) {
  view = newView;
  const isOpen = view !== 'closed';

  fabEl.classList.toggle('open', isOpen);
  menuEl.classList.toggle('open', view === 'menu');
  panelEl.classList.toggle('open', view === 'feedback');

  if (view === 'feedback') {
    setTimeout(() => textareaEl.focus(), 50);
  }
}

function setSubmitState(state) {
  submitState = state;
  submitBtn.classList.toggle('sending', state === 'sending');
  submitBtn.classList.toggle('error', state === 'error');
  submitBtn.disabled = state === 'sending';

  // Toggle between form and success views
  formEl.style.display = state === 'success' ? 'none' : 'flex';
  successEl.style.display = state === 'success' ? 'flex' : 'none';
}

async function handleSubmit(e) {
  e.preventDefault();
  const message = textareaEl.value.trim();
  if (!message) return;

  const screenshot = captureScreenshot();
  const consoleLogs = getCapturedLogs();

  setSubmitState('sending');
  try {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Player Feedback',
        body: message,
        context: {
          urlPath: window.location.pathname,
          userAgent: navigator.userAgent,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          timestamp: new Date().toISOString(),
          screenshot,
          consoleLogs: consoleLogs.length > 0 ? consoleLogs : null,
        },
      }),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    setSubmitState('success');
    textareaEl.value = '';
    setTimeout(() => {
      setView('closed');
      setTimeout(() => setSubmitState('idle'), 350);
    }, 2000);
  } catch {
    setSubmitState('error');
    setTimeout(() => setSubmitState('idle'), 3000);
  }
}

function createDOM() {
  // FAB button
  fabEl = document.createElement('button');
  fabEl.id = 'feedback-fab';
  fabEl.className = 'epoch-fab';
  fabEl.setAttribute('aria-label', 'Open menu');
  fabEl.innerHTML = `
    <svg class="epoch-fab-icon epoch-fab-icon--default" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
    <svg class="epoch-fab-icon epoch-fab-icon--close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  `;

  // Menu
  menuEl = document.createElement('div');
  menuEl.id = 'feedback-menu';
  menuEl.className = 'epoch-fab-menu';
  menuEl.innerHTML = `
    <button class="epoch-fab-menu-item" id="feedback-menu-btn">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      Feedback
    </button>
  `;

  // Feedback panel
  panelEl = document.createElement('div');
  panelEl.id = 'feedback-panel';
  panelEl.className = 'epoch-feedback-panel';
  panelEl.innerHTML = `
    <div class="epoch-feedback-header">
      <span>// send feedback</span>
    </div>
    <form class="epoch-feedback-form" id="feedback-form">
      <textarea
        class="epoch-feedback-textarea"
        id="feedback-textarea"
        placeholder="What's on your mind?"
        rows="4"
        required
      ></textarea>
      <button type="submit" class="epoch-feedback-submit" id="feedback-submit">
        <span class="label">Send Feedback</span>
        <span class="sending">Sending\u2026</span>
        <svg class="arrow" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
      </button>
      <span class="epoch-feedback-hint">Posted as a GitHub issue \u00b7 screenshot included</span>
    </form>
    <div class="epoch-feedback-success" id="feedback-success" style="display:none">
      <div class="epoch-feedback-success-icon">\u2713</div>
      <p>Thanks for the feedback!</p>
      <p class="sub">Your message has been submitted.</p>
    </div>
  `;

  document.body.appendChild(fabEl);
  document.body.appendChild(menuEl);
  document.body.appendChild(panelEl);

  // Cache refs
  textareaEl = document.getElementById('feedback-textarea');
  submitBtn = document.getElementById('feedback-submit');
  successEl = document.getElementById('feedback-success');
  formEl = document.getElementById('feedback-form');

  // Event listeners
  fabEl.addEventListener('click', (e) => {
    e.stopPropagation();
    setView(view === 'closed' ? 'menu' : 'closed');
  });

  document.getElementById('feedback-menu-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    setView('feedback');
  });

  formEl.addEventListener('submit', handleSubmit);

  // Close on escape or click outside
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && view !== 'closed') {
      e.stopPropagation();
      setView('closed');
    }
  });

  document.addEventListener('click', (e) => {
    if (
      view !== 'closed' &&
      !fabEl.contains(e.target) &&
      !menuEl.contains(e.target) &&
      !panelEl.contains(e.target)
    ) {
      setView('closed');
    }
  });
}

export function initFeedbackFab() {
  initConsoleCapture();
  createDOM();
  // Start hidden
  hide();
}

export function show() {
  if (visible) return;
  visible = true;
  fabEl.style.display = 'flex';
  menuEl.style.display = 'flex';
  panelEl.style.display = 'block';
}

export function hide() {
  if (!visible && view === 'closed') return;
  visible = false;
  setView('closed');
  fabEl.style.display = 'none';
  menuEl.style.display = 'none';
  panelEl.style.display = 'none';
}

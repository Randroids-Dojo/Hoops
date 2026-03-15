// Hard-refresh update notification banner
// Polls /api/version and shows a reload prompt when a new version is deployed.

const POLL_INTERVAL_MS = 60_000;
const INITIAL_DELAY_MS = 30_000;

export function initUpdateBanner() {
  let currentVersion = null;
  let banner = null;

  function showBanner() {
    if (banner) return;

    banner = document.createElement('div');
    banner.id = 'update-banner';
    banner.innerHTML = `
      <span>NEW VERSION AVAILABLE</span>
      <button id="update-reload-btn">RELOAD</button>
    `;
    document.body.appendChild(banner);

    document.getElementById('update-reload-btn').addEventListener('click', () => {
      window.location.reload();
    });
  }

  async function check() {
    try {
      const res = await fetch('/api/version', { cache: 'no-store' });
      if (!res.ok) return;
      const { version } = await res.json();
      if (!version || version === 'dev') return;

      if (currentVersion === null) {
        // First check — record the baseline version
        currentVersion = version;
      } else if (version !== currentVersion) {
        showBanner();
      }
    } catch {
      // Network error — ignore
    }
  }

  const initial = setTimeout(() => {
    check();
    setInterval(check, POLL_INTERVAL_MS);
  }, INITIAL_DELAY_MS);

  return () => clearTimeout(initial);
}

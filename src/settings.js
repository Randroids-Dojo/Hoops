// Persisted player settings. Values survive reloads via localStorage.

const STORAGE_KEY = 'hoops-settings-v1';

const DEFAULTS = {
  // Side of the screen the oscillating power meter is anchored to.
  // 'left' is the default — players can flip it to 'right' in Settings.
  powerMeterSide: 'left',
};

const state = { ...DEFAULTS };

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      if (parsed.powerMeterSide === 'left' || parsed.powerMeterSide === 'right') {
        state.powerMeterSide = parsed.powerMeterSide;
      }
    }
  } catch {
    // ignore — fall back to defaults
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota / privacy-mode errors
  }
}

load();

export const settings = {
  get powerMeterSide() {
    return state.powerMeterSide;
  },

  togglePowerMeterSide() {
    state.powerMeterSide = state.powerMeterSide === 'left' ? 'right' : 'left';
    save();
    return state.powerMeterSide;
  },
};

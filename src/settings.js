// Persisted player settings. Values survive reloads via localStorage.
import { readStorage, writeStorage } from '@randroids-dojo/vibekit';
import { z } from 'zod';

const STORAGE_KEY = 'hoops-settings-v1';
const SettingsSchema = z.object({
  powerMeterSide: z.enum(['left', 'right']).optional(),
});

const DEFAULTS = {
  // Side of the screen the oscillating power meter is anchored to.
  // 'left' is the default — players can flip it to 'right' in Settings.
  powerMeterSide: 'left',
};

const state = { ...DEFAULTS };

function load() {
  const parsed = readStorage(STORAGE_KEY, SettingsSchema);
  if (parsed?.powerMeterSide) state.powerMeterSide = parsed.powerMeterSide;
}

function save() {
  writeStorage(STORAGE_KEY, state);
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

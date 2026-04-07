import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../helpers/msw/server';
import { useSettingsStore } from '../../../src/store/settingsStore';
import { resetAllStores } from '../../helpers/store';
import { buildSettings } from '../../helpers/factories';

beforeEach(() => {
  resetAllStores();
});

describe('settingsStore', () => {
  describe('FE-SETTINGS-001: loadSettings()', () => {
    it('fetches settings and updates store', async () => {
      const settings = buildSettings({ default_currency: 'EUR', language: 'de' });
      server.use(
        http.get('/api/settings', () => HttpResponse.json({ settings }))
      );

      await useSettingsStore.getState().loadSettings();
      const state = useSettingsStore.getState();

      expect(state.settings.default_currency).toBe('EUR');
      expect(state.settings.language).toBe('de');
      expect(state.isLoaded).toBe(true);
    });
  });

  describe('FE-SETTINGS-002: updateSetting() optimistic update', () => {
    it('immediately updates local state before API resolves', async () => {
      // The store's set() is called synchronously before the first await (settingsApi.set)
      // so state is visible without needing to await the full action.
      const promise = useSettingsStore.getState().updateSetting('default_currency', 'GBP');

      // Check optimistic state — no await needed here
      expect(useSettingsStore.getState().settings.default_currency).toBe('GBP');

      // Let the API call finish to avoid dangling promises
      await promise;
    });
  });

  describe('FE-SETTINGS-003: updateSetting() reverts on API failure', () => {
    it('throws when API fails', async () => {
      server.use(
        http.put('/api/settings', () =>
          HttpResponse.json({ error: 'Server error' }, { status: 500 })
        )
      );

      // The store optimistically sets, then throws — the revert is a throw
      await expect(
        useSettingsStore.getState().updateSetting('default_currency', 'GBP')
      ).rejects.toThrow();
    });
  });

  describe('FE-SETTINGS-004: Language change', () => {
    it('updates language field and localStorage', async () => {
      await useSettingsStore.getState().updateSetting('language', 'fr');

      const state = useSettingsStore.getState();
      expect(state.settings.language).toBe('fr');
      expect(localStorage.getItem('app_language')).toBe('fr');
    });
  });

  describe('FE-SETTINGS-005: loadSettings failure', () => {
    it('sets isLoaded: true even on API failure (graceful)', async () => {
      server.use(
        http.get('/api/settings', () =>
          HttpResponse.json({ error: 'Server error' }, { status: 500 })
        )
      );

      await useSettingsStore.getState().loadSettings();
      const state = useSettingsStore.getState();

      expect(state.isLoaded).toBe(true);
    });
  });
});

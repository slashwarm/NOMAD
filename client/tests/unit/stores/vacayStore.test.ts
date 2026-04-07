import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../helpers/msw/server';
import { useVacayStore } from '../../../src/store/vacayStore';
import { resetAllStores } from '../../helpers/store';

beforeEach(() => {
  resetAllStores();
});

describe('vacayStore', () => {
  describe('FE-VACAY-001: loadAll()', () => {
    it('fetches plan, years, entries, and stats, updates state', async () => {
      await useVacayStore.getState().loadAll();
      const state = useVacayStore.getState();

      expect(state.plan).not.toBeNull();
      expect(state.plan?.id).toBe(1);
      expect(state.years).toEqual([2025, 2026]);
      expect(state.entries.length).toBeGreaterThan(0);
      expect(state.stats.length).toBeGreaterThan(0);
      expect(state.loading).toBe(false);
    });
  });

  describe('FE-VACAY-002: toggleEntry()', () => {
    it('calls the toggle API then reloads entries and stats', async () => {
      // Seed selected year
      useVacayStore.setState({ selectedYear: 2025 });

      let toggled = false;
      server.use(
        http.post('/api/addons/vacay/entries/toggle', () => {
          toggled = true;
          return HttpResponse.json({ success: true });
        })
      );

      await useVacayStore.getState().toggleEntry('2025-06-20');

      expect(toggled).toBe(true);
      // After toggle, entries are refreshed from MSW (2 entries)
      expect(useVacayStore.getState().entries.length).toBe(2);
    });
  });

  describe('FE-VACAY-003: loadHolidays() — holidays_enabled with calendars', () => {
    it('populates holidays map when plan has holiday calendars', async () => {
      // Set plan state with holidays_enabled and a simple (non-regional) calendar
      useVacayStore.setState({
        selectedYear: 2025,
        plan: {
          id: 1,
          holidays_enabled: true,
          holidays_region: null,
          holiday_calendars: [
            { id: 1, plan_id: 1, region: 'DE', label: 'Germany', color: '#ef4444', sort_order: 0 },
          ],
          block_weekends: true,
          carry_over_enabled: false,
          company_holidays_enabled: false,
        },
      });

      // Override MSW to return non-regional holidays (no counties)
      server.use(
        http.get('/api/addons/vacay/holidays/:year/:country', () =>
          HttpResponse.json([
            { date: '2025-12-25', name: 'Christmas', localName: 'Weihnachten', global: true, counties: null },
            { date: '2025-01-01', name: 'New Year', localName: 'Neujahr', global: true, counties: null },
          ])
        )
      );

      await useVacayStore.getState().loadHolidays(2025);
      const state = useVacayStore.getState();

      expect(Object.keys(state.holidays).length).toBeGreaterThan(0);
      expect(state.holidays['2025-12-25']).toBeDefined();
      expect(state.holidays['2025-12-25'].name).toBe('Christmas');
    });
  });

  describe('FE-VACAY-003b: loadHolidays() — holidays not enabled', () => {
    it('sets holidays to empty map when holidays_enabled is false', async () => {
      useVacayStore.setState({
        selectedYear: 2025,
        plan: {
          id: 1,
          holidays_enabled: false,
          holidays_region: null,
          holiday_calendars: [],
          block_weekends: true,
          carry_over_enabled: false,
          company_holidays_enabled: false,
        },
      });

      await useVacayStore.getState().loadHolidays(2025);
      expect(useVacayStore.getState().holidays).toEqual({});
    });
  });

  describe('FE-VACAY-004a: updatePlan()', () => {
    it('updates plan and reloads entries, stats, holidays', async () => {
      // Need existing plan for holiday check in loadHolidays
      useVacayStore.setState({
        selectedYear: 2025,
        plan: {
          id: 1,
          holidays_enabled: false,
          holidays_region: null,
          holiday_calendars: [],
          block_weekends: true,
          carry_over_enabled: false,
          company_holidays_enabled: false,
        },
      });

      await useVacayStore.getState().updatePlan({ holidays_enabled: true });
      const state = useVacayStore.getState();

      // The MSW handler for PUT /addons/vacay/plan returns holidays_enabled: true
      expect(state.plan?.holidays_enabled).toBe(true);
    });
  });

  describe('FE-VACAY-004b: addYear()', () => {
    it('adds a year and the years list is updated', async () => {
      await useVacayStore.getState().addYear(2027);
      expect(useVacayStore.getState().years).toContain(2027);
    });
  });

  describe('FE-VACAY-004c: removeYear()', () => {
    it('removes a year and updates the years list', async () => {
      useVacayStore.setState({ years: [2025, 2026], selectedYear: 2026 });

      await useVacayStore.getState().removeYear(2026);
      const state = useVacayStore.getState();

      // MSW returns [2025] after delete
      expect(state.years).toEqual([2025]);
      // selectedYear should shift to the last remaining year
      expect(state.selectedYear).toBe(2025);
    });
  });
});

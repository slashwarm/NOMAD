// FE-COMP-DISPLAY-001 to FE-COMP-DISPLAY-012
import { render, screen, waitFor } from '../../../tests/helpers/render';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../../tests/helpers/msw/server';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { resetAllStores, seedStore } from '../../../tests/helpers/store';
import { buildUser, buildSettings } from '../../../tests/helpers/factories';
import DisplaySettingsTab from './DisplaySettingsTab';

beforeEach(() => {
  resetAllStores();
  server.use(
    http.put('/api/settings', async () => HttpResponse.json({ success: true })),
  );
  seedStore(useAuthStore, { user: buildUser(), isAuthenticated: true });
  seedStore(useSettingsStore, { settings: buildSettings({ dark_mode: 'light', language: 'en' }) });
});

describe('DisplaySettingsTab', () => {
  it('FE-COMP-DISPLAY-001: renders without crashing', () => {
    render(<DisplaySettingsTab />);
    expect(document.body).toBeInTheDocument();
  });

  it('FE-COMP-DISPLAY-002: shows Display section title', () => {
    render(<DisplaySettingsTab />);
    expect(screen.getByText('Display')).toBeInTheDocument();
  });

  it('FE-COMP-DISPLAY-003: shows Light mode button', () => {
    render(<DisplaySettingsTab />);
    expect(screen.getByText('Light')).toBeInTheDocument();
  });

  it('FE-COMP-DISPLAY-004: shows Dark mode button', () => {
    render(<DisplaySettingsTab />);
    expect(screen.getByText('Dark')).toBeInTheDocument();
  });

  it('FE-COMP-DISPLAY-005: shows Auto mode button', () => {
    render(<DisplaySettingsTab />);
    expect(screen.getByText('Auto')).toBeInTheDocument();
  });

  it('FE-COMP-DISPLAY-006: shows Language section', () => {
    render(<DisplaySettingsTab />);
    expect(screen.getByText('Language')).toBeInTheDocument();
  });

  it('FE-COMP-DISPLAY-007: shows Time Format section', () => {
    render(<DisplaySettingsTab />);
    expect(screen.getByText('Time Format')).toBeInTheDocument();
  });

  it('FE-COMP-DISPLAY-008: clicking Dark mode button calls updateSetting', async () => {
    const user = userEvent.setup();
    const updateSetting = vi.fn().mockResolvedValue(undefined);
    seedStore(useSettingsStore, { settings: buildSettings({ dark_mode: 'light' }), updateSetting });
    render(<DisplaySettingsTab />);
    await user.click(screen.getByText('Dark'));
    expect(updateSetting).toHaveBeenCalledWith('dark_mode', 'dark');
  });

  it('FE-COMP-DISPLAY-009: shows Color Mode label', () => {
    render(<DisplaySettingsTab />);
    expect(screen.getByText('Color Mode')).toBeInTheDocument();
  });

  it('FE-COMP-DISPLAY-010: shows 24h time format option', () => {
    render(<DisplaySettingsTab />);
    // Label is "24h (14:30)"
    expect(screen.getByText(/24h/i)).toBeInTheDocument();
  });

  it('FE-COMP-DISPLAY-011: shows 12h time format option', () => {
    render(<DisplaySettingsTab />);
    // Label is "12h (2:30 PM)"
    expect(screen.getByText(/12h/i)).toBeInTheDocument();
  });

  it('FE-COMP-DISPLAY-012: clicking Light mode calls updateSetting with light', async () => {
    const user = userEvent.setup();
    const updateSetting = vi.fn().mockResolvedValue(undefined);
    seedStore(useSettingsStore, { settings: buildSettings({ dark_mode: 'dark' }), updateSetting });
    render(<DisplaySettingsTab />);
    await user.click(screen.getByText('Light'));
    expect(updateSetting).toHaveBeenCalledWith('dark_mode', 'light');
  });
});

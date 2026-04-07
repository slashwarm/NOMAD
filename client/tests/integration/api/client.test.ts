import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../helpers/msw/server';
import { buildUser } from '../../helpers/factories';

// The global setup.ts mocks websocket with getSocketId returning null.
// We need to be able to control what getSocketId returns per-test.
// Re-mock here to get full control.
vi.mock('../../../src/api/websocket', () => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  getSocketId: vi.fn(() => 'mock-socket-id'),
  setRefetchCallback: vi.fn(),
  joinTrip: vi.fn(),
  leaveTrip: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
}));

const wsMock = await import('../../../src/api/websocket');

// Import the API client AFTER the mock is set up so it picks up our getSocketId mock
const { authApi } = await import('../../../src/api/client');

describe('API client interceptors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: socket ID available
    (wsMock.getSocketId as ReturnType<typeof vi.fn>).mockReturnValue('mock-socket-id');
  });

  afterEach(() => {
    // Reset window.location to a neutral path
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { href: 'http://localhost/', pathname: '/', search: '', hash: '' },
    });
  });

  it('FE-API-001: requests include X-Socket-Id header when getSocketId returns a value', async () => {
    let receivedSocketId: string | null = null;

    server.use(
      http.get('/api/auth/me', ({ request }) => {
        receivedSocketId = request.headers.get('X-Socket-Id');
        return HttpResponse.json({ user: buildUser() });
      })
    );

    await authApi.me();

    expect(receivedSocketId).toBe('mock-socket-id');
  });

  it('FE-API-002: X-Socket-Id header is absent when getSocketId returns null', async () => {
    (wsMock.getSocketId as ReturnType<typeof vi.fn>).mockReturnValue(null);
    let receivedSocketId: string | null = 'sentinel';

    server.use(
      http.get('/api/auth/me', ({ request }) => {
        receivedSocketId = request.headers.get('X-Socket-Id');
        return HttpResponse.json({ user: buildUser() });
      })
    );

    await authApi.me();

    expect(receivedSocketId).toBeNull();
  });

  it('FE-API-003: 401 with AUTH_REQUIRED → redirects to /login with redirect param', async () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { href: 'http://localhost/', pathname: '/dashboard', search: '', hash: '' },
    });

    server.use(
      http.get('/api/auth/me', () => {
        return HttpResponse.json({ code: 'AUTH_REQUIRED' }, { status: 401 });
      })
    );

    try {
      await authApi.me();
    } catch {
      // Expected to reject
    }

    expect(window.location.href).toBe('/login?redirect=%2Fdashboard');
  });

  it('FE-API-003b: 401 without AUTH_REQUIRED code does not redirect', async () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { href: 'http://localhost/dashboard', pathname: '/dashboard', search: '' },
    });

    const originalHref = window.location.href;

    server.use(
      http.get('/api/auth/me', () => {
        return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
      })
    );

    try {
      await authApi.me();
    } catch {
      // Expected to reject
    }

    expect(window.location.href).toBe(originalHref);
  });

  it('FE-API-003c: 401 on /login page does not redirect', async () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { href: 'http://localhost/login', pathname: '/login', search: '' },
    });

    server.use(
      http.get('/api/auth/me', () => {
        return HttpResponse.json({ code: 'AUTH_REQUIRED' }, { status: 401 });
      })
    );

    try {
      await authApi.me();
    } catch {
      // Expected to reject
    }

    // href should NOT have been changed to /login?redirect=...
    expect(window.location.href).toBe('http://localhost/login');
  });

  it('FE-API-004: 403 with MFA_REQUIRED → redirects to /settings?mfa=required', async () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { href: 'http://localhost/', pathname: '/dashboard', search: '' },
    });

    server.use(
      http.get('/api/auth/me', () => {
        return HttpResponse.json({ code: 'MFA_REQUIRED' }, { status: 403 });
      })
    );

    try {
      await authApi.me();
    } catch {
      // Expected to reject
    }

    expect(window.location.href).toBe('/settings?mfa=required');
  });

  it('FE-API-004b: 403 with MFA_REQUIRED on /settings page does not redirect', async () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { href: 'http://localhost/settings', pathname: '/settings', search: '' },
    });

    server.use(
      http.get('/api/auth/me', () => {
        return HttpResponse.json({ code: 'MFA_REQUIRED' }, { status: 403 });
      })
    );

    try {
      await authApi.me();
    } catch {
      // Expected to reject
    }

    // Should NOT redirect when already on /settings
    expect(window.location.href).toBe('http://localhost/settings');
  });

  it('FE-API-005: successful API call returns response data', async () => {
    const user = buildUser();

    server.use(
      http.get('/api/auth/me', () => {
        return HttpResponse.json({ user });
      })
    );

    const data = await authApi.me();

    expect(data).toMatchObject({ user: { id: user.id, email: user.email } });
  });

  it('FE-API-006: socket ID header reflects current value from getSocketId at request time', async () => {
    const headers: Array<string | null> = [];

    (wsMock.getSocketId as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce('socket-A')
      .mockReturnValueOnce('socket-B');

    server.use(
      http.get('/api/auth/me', ({ request }) => {
        headers.push(request.headers.get('X-Socket-Id'));
        return HttpResponse.json({ user: buildUser() });
      })
    );

    await authApi.me();
    await authApi.me();

    expect(headers[0]).toBe('socket-A');
    expect(headers[1]).toBe('socket-B');
  });

  it('FE-API-007: non-401/403 errors are passed through as rejections', async () => {
    server.use(
      http.get('/api/auth/me', () => {
        return HttpResponse.json({ error: 'Internal error' }, { status: 500 });
      })
    );

    await expect(authApi.me()).rejects.toThrow();
  });
});

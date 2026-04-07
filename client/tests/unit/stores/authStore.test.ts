import { describe, it, expect, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../helpers/msw/server';
import { useAuthStore } from '../../../src/store/authStore';
import { resetAllStores } from '../../helpers/store';
import { buildUser } from '../../helpers/factories';

// The websocket module is already mocked globally in tests/setup.ts
import { connect, disconnect } from '../../../src/api/websocket';

beforeEach(() => {
  resetAllStores();
  vi.clearAllMocks();
});

describe('authStore', () => {
  describe('FE-AUTH-001: Successful login', () => {
    it('sets user, isAuthenticated: true, isLoading: false', async () => {
      const user = buildUser();
      server.use(
        http.post('/api/auth/login', () =>
          HttpResponse.json({ user, token: 'tok' })
        )
      );

      await useAuthStore.getState().login(user.email, 'password');
      const state = useAuthStore.getState();

      expect(state.user).toEqual(user);
      expect(state.isAuthenticated).toBe(true);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe('FE-AUTH-002: Login failure', () => {
    it('sets error and isAuthenticated: false', async () => {
      server.use(
        http.post('/api/auth/login', () =>
          HttpResponse.json({ error: 'Bad credentials' }, { status: 401 })
        )
      );

      await expect(
        useAuthStore.getState().login('bad@example.com', 'wrong')
      ).rejects.toThrow();

      const state = useAuthStore.getState();
      expect(state.error).toBe('Bad credentials');
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
    });
  });

  describe('FE-AUTH-003: Login calls connect()', () => {
    it('calls connect from websocket module after successful login', async () => {
      const user = buildUser();
      server.use(
        http.post('/api/auth/login', () =>
          HttpResponse.json({ user, token: 'tok' })
        )
      );

      await useAuthStore.getState().login(user.email, 'password');

      expect(connect).toHaveBeenCalledOnce();
    });
  });

  describe('FE-AUTH-004: loadUser with valid session', () => {
    it('sets user state from /auth/me', async () => {
      const user = buildUser();
      server.use(
        http.get('/api/auth/me', () => HttpResponse.json({ user }))
      );

      await useAuthStore.getState().loadUser();
      const state = useAuthStore.getState();

      expect(state.user).toEqual(user);
      expect(state.isAuthenticated).toBe(true);
      expect(state.isLoading).toBe(false);
    });
  });

  describe('FE-AUTH-005: loadUser with 401', () => {
    it('clears auth state on 401', async () => {
      server.use(
        http.get('/api/auth/me', () =>
          HttpResponse.json({ error: 'Unauthorized' }, { status: 401 })
        )
      );

      // Pre-seed as authenticated
      useAuthStore.setState({ user: buildUser(), isAuthenticated: true });

      await useAuthStore.getState().loadUser();
      const state = useAuthStore.getState();

      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
    });
  });

  describe('FE-AUTH-006: logout', () => {
    it('calls disconnect() and clears user state', () => {
      useAuthStore.setState({ user: buildUser(), isAuthenticated: true });

      useAuthStore.getState().logout();
      const state = useAuthStore.getState();

      expect(disconnect).toHaveBeenCalledOnce();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });
  });

  describe('FE-AUTH-007: Register success', () => {
    it('sets user and authenticates', async () => {
      const user = buildUser();
      server.use(
        http.post('/api/auth/register', () =>
          HttpResponse.json({ user, token: 'tok' })
        )
      );

      await useAuthStore.getState().register(user.username, user.email, 'password');
      const state = useAuthStore.getState();

      expect(state.user).toEqual(user);
      expect(state.isAuthenticated).toBe(true);
      expect(state.isLoading).toBe(false);
    });
  });

  describe('FE-AUTH-008: authSequence guard', () => {
    it('stale loadUser does not overwrite fresh login state', async () => {
      let resolveStale!: (v: Response) => void;
      const stalePromise = new Promise<Response>((res) => { resolveStale = res; });

      // First call to /auth/me will hang until we resolve it manually
      let callCount = 0;
      server.use(
        http.get('/api/auth/me', async () => {
          callCount++;
          if (callCount === 1) {
            // Stale request — wait
            await stalePromise;
            return HttpResponse.json({ user: buildUser({ username: 'stale' }) });
          }
          // Should not be called a second time in this test
          return HttpResponse.json({ user: buildUser({ username: 'fresh' }) });
        })
      );

      // Start loadUser but don't await yet
      const staleLoad = useAuthStore.getState().loadUser();

      // Meanwhile, perform a login (bumps authSequence)
      const freshUser = buildUser({ username: 'freshlogin' });
      server.use(
        http.post('/api/auth/login', () =>
          HttpResponse.json({ user: freshUser, token: 'tok' })
        )
      );
      await useAuthStore.getState().login(freshUser.email, 'password');

      // Now resolve the stale loadUser response
      resolveStale(new Response());
      await staleLoad;

      // The fresh login state must be preserved
      const state = useAuthStore.getState();
      expect(state.user?.username).toBe('freshlogin');
      expect(state.isAuthenticated).toBe(true);
    });
  });

  describe('FE-AUTH-009: MFA-required state handling', () => {
    it('returns mfa_required flag and does not set user as authenticated', async () => {
      server.use(
        http.post('/api/auth/login', () =>
          HttpResponse.json({ mfa_required: true, mfa_token: 'mfa-tok-123' })
        )
      );

      const result = await useAuthStore.getState().login('user@example.com', 'password');

      expect(result).toMatchObject({ mfa_required: true, mfa_token: 'mfa-tok-123' });
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
    });
  });
});

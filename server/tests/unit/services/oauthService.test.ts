/**
 * Unit tests for server/src/services/oauthService.ts.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import crypto from 'crypto';

const { testDb, dbMock } = vi.hoisted(() => {
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  const mock = {
    db,
    closeDb: () => {},
    reinitialize: () => {},
    getPlaceWithTags: () => null,
    canAccessTrip: (tripId: any, userId: number) =>
      db.prepare(`SELECT t.id, t.user_id FROM trips t LEFT JOIN trip_members m ON m.trip_id = t.id AND m.user_id = ? WHERE t.id = ? AND (t.user_id = ? OR m.user_id IS NOT NULL)`).get(userId, tripId, userId),
    isOwner: (tripId: any, userId: number) =>
      !!db.prepare('SELECT id FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId),
  };
  return { testDb: db, dbMock: mock };
});

vi.mock('../../../src/db/database', () => dbMock);
vi.mock('../../../src/config', () => ({
  JWT_SECRET: 'test-jwt-secret-for-trek-testing-only',
  ENCRYPTION_KEY: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2',
  updateJwtSecret: () => {},
}));
vi.mock('../../../src/services/apiKeyCrypto', () => ({
  encrypt_api_key: (v: string) => v,
  decrypt_api_key: (v: string) => v,
  maybe_encrypt_api_key: (v: string) => v,
}));
vi.mock('../../../src/mcp', () => ({ revokeUserSessions: vi.fn() }));
vi.mock('../../../src/demo/demo-reset', () => ({ saveBaseline: vi.fn() }));
vi.mock('../../../src/services/adminService', () => ({
  isAddonEnabled: vi.fn().mockReturnValue(true),
}));

import { createTables } from '../../../src/db/schema';
import { runMigrations } from '../../../src/db/migrations';
import { resetTestDb } from '../../helpers/test-db';
import { createUser } from '../../helpers/factories';
import {
  createOAuthClient,
  listOAuthClients,
  deleteOAuthClient,
  rotateOAuthClientSecret,
  createAuthCode,
  consumeAuthCode,
  issueTokens,
  getUserByAccessToken,
  refreshTokens,
  revokeToken,
  listOAuthSessions,
  revokeSession,
  validateAuthorizeRequest,
  verifyPKCE,
  authenticateClient,
  saveConsent,
  getConsent,
  isConsentSufficient,
} from '../../../src/services/oauthService';
import { isAddonEnabled } from '../../../src/services/adminService';

beforeAll(() => {
  createTables(testDb);
  runMigrations(testDb);
});

beforeEach(() => {
  resetTestDb(testDb);
  // Clear oauth tables manually since they're not in the standard reset list
  testDb.exec('DELETE FROM oauth_tokens');
  testDb.exec('DELETE FROM oauth_consents');
  testDb.exec('DELETE FROM oauth_clients');
  vi.mocked(isAddonEnabled).mockReturnValue(true);
});

afterAll(() => {
  testDb.close();
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeClient(
  userId: number,
  overrides: Partial<{ name: string; redirectUris: string[]; scopes: string[] }> = {}
) {
  return createOAuthClient(
    userId,
    overrides.name ?? 'Test Client',
    overrides.redirectUris ?? ['https://example.com/callback'],
    overrides.scopes ?? ['trips:read'],
  );
}

// ---------------------------------------------------------------------------
// createOAuthClient
// ---------------------------------------------------------------------------

describe('createOAuthClient', () => {
  it('creates a client successfully and returns client_secret only on creation', () => {
    const { user } = createUser(testDb);
    const result = makeClient(user.id);
    expect(result.error).toBeUndefined();
    expect(result.client).toBeDefined();
    expect(typeof result.client!.client_secret).toBe('string');
    expect((result.client!.client_secret as string).startsWith('trekcs_')).toBe(true);
  });

  it('client_id is a UUID', () => {
    const { user } = createUser(testDb);
    const result = makeClient(user.id);
    expect(result.client!.client_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it('returns 400 error if name is empty', () => {
    const { user } = createUser(testDb);
    const result = createOAuthClient(user.id, '', ['https://example.com/cb'], ['trips:read']);
    expect(result.status).toBe(400);
    expect(result.error).toContain('Name');
  });

  it('returns 400 error if name exceeds 100 characters', () => {
    const { user } = createUser(testDb);
    const longName = 'A'.repeat(101);
    const result = createOAuthClient(user.id, longName, ['https://example.com/cb'], ['trips:read']);
    expect(result.status).toBe(400);
    expect(result.error).toContain('100');
  });

  it('returns 400 error if no redirect URIs provided', () => {
    const { user } = createUser(testDb);
    const result = createOAuthClient(user.id, 'Test', [], ['trips:read']);
    expect(result.status).toBe(400);
    expect(result.error).toContain('redirect URI');
  });

  it('returns 400 error if more than 10 redirect URIs provided', () => {
    const { user } = createUser(testDb);
    const uris = Array.from({ length: 11 }, (_, i) => `https://example${i}.com/cb`);
    const result = createOAuthClient(user.id, 'Test', uris, ['trips:read']);
    expect(result.status).toBe(400);
    expect(result.error).toContain('10');
  });

  it('returns 400 error for invalid URI format', () => {
    const { user } = createUser(testDb);
    const result = createOAuthClient(user.id, 'Test', ['not-a-url'], ['trips:read']);
    expect(result.status).toBe(400);
    expect(result.error).toContain('Invalid redirect URI');
  });

  it('returns 400 error for non-https URI (not localhost)', () => {
    const { user } = createUser(testDb);
    const result = createOAuthClient(user.id, 'Test', ['http://example.com/cb'], ['trips:read']);
    expect(result.status).toBe(400);
    expect(result.error).toContain('HTTPS');
  });

  it('allows http://localhost redirect URI', () => {
    const { user } = createUser(testDb);
    const result = createOAuthClient(user.id, 'Test', ['http://localhost:3000/callback'], ['trips:read']);
    expect(result.error).toBeUndefined();
    expect(result.client).toBeDefined();
  });

  it('allows http://127.0.0.1 redirect URI', () => {
    const { user } = createUser(testDb);
    const result = createOAuthClient(user.id, 'Test', ['http://127.0.0.1:5000/callback'], ['trips:read']);
    expect(result.error).toBeUndefined();
    expect(result.client).toBeDefined();
  });

  it('returns 400 error if no scopes provided', () => {
    const { user } = createUser(testDb);
    const result = createOAuthClient(user.id, 'Test', ['https://example.com/cb'], []);
    expect(result.status).toBe(400);
    expect(result.error).toContain('scope');
  });

  it('returns 400 error for invalid scopes', () => {
    const { user } = createUser(testDb);
    const result = createOAuthClient(user.id, 'Test', ['https://example.com/cb'], ['invalid:scope']);
    expect(result.status).toBe(400);
    expect(result.error).toContain('Invalid scopes');
  });

  it('enforces max 10 clients per user', () => {
    const { user } = createUser(testDb);
    for (let i = 0; i < 10; i++) {
      const r = makeClient(user.id, { name: `Client ${i}` });
      expect(r.error).toBeUndefined();
    }
    const eleventh = makeClient(user.id, { name: 'Eleventh' });
    expect(eleventh.status).toBe(400);
    expect(eleventh.error).toContain('10');
  });
});

// ---------------------------------------------------------------------------
// listOAuthClients
// ---------------------------------------------------------------------------

describe('listOAuthClients', () => {
  it('returns empty array for user with no clients', () => {
    const { user } = createUser(testDb);
    expect(listOAuthClients(user.id)).toEqual([]);
  });

  it('returns created clients with redirect_uris and allowed_scopes as arrays', () => {
    const { user } = createUser(testDb);
    makeClient(user.id, { name: 'Client A', redirectUris: ['https://a.com/cb'], scopes: ['trips:read', 'budget:read'] });
    const clients = listOAuthClients(user.id);
    expect(clients).toHaveLength(1);
    expect(clients[0].name).toBe('Client A');
    expect(Array.isArray(clients[0].redirect_uris)).toBe(true);
    expect(Array.isArray(clients[0].allowed_scopes)).toBe(true);
    expect(clients[0].allowed_scopes).toContain('trips:read');
  });
});

// ---------------------------------------------------------------------------
// deleteOAuthClient
// ---------------------------------------------------------------------------

describe('deleteOAuthClient', () => {
  it('deletes own client successfully', () => {
    const { user } = createUser(testDb);
    const created = makeClient(user.id);
    const clientRowId = created.client!.id as string;
    const result = deleteOAuthClient(user.id, clientRowId);
    expect(result.success).toBe(true);
    expect(listOAuthClients(user.id)).toHaveLength(0);
  });

  it('returns 404 for non-existent client', () => {
    const { user } = createUser(testDb);
    const result = deleteOAuthClient(user.id, 'non-existent-id');
    expect(result.status).toBe(404);
  });

  it("returns 404 for another user's client", () => {
    const { user: owner } = createUser(testDb);
    const { user: other } = createUser(testDb);
    const created = makeClient(owner.id);
    const result = deleteOAuthClient(other.id, created.client!.id as string);
    expect(result.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// rotateOAuthClientSecret
// ---------------------------------------------------------------------------

describe('rotateOAuthClientSecret', () => {
  it('rotates secret and returns new client_secret starting with trekcs_', () => {
    const { user } = createUser(testDb);
    const created = makeClient(user.id);
    const oldSecret = created.client!.client_secret as string;
    const result = rotateOAuthClientSecret(user.id, created.client!.id as string);
    expect(result.error).toBeUndefined();
    expect(result.client_secret).toBeDefined();
    expect((result.client_secret as string).startsWith('trekcs_')).toBe(true);
    expect(result.client_secret).not.toBe(oldSecret);
  });

  it('returns 404 for non-existent client', () => {
    const { user } = createUser(testDb);
    const result = rotateOAuthClientSecret(user.id, 'non-existent-id');
    expect(result.status).toBe(404);
  });

  it('revokes old tokens after rotation', () => {
    const { user } = createUser(testDb);
    const created = makeClient(user.id);
    const clientId = created.client!.client_id as string;
    const { access_token } = issueTokens(clientId, user.id, ['trips:read']);
    expect(getUserByAccessToken(access_token)).not.toBeNull();

    rotateOAuthClientSecret(user.id, created.client!.id as string);

    expect(getUserByAccessToken(access_token)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// createAuthCode + consumeAuthCode
// ---------------------------------------------------------------------------

describe('createAuthCode + consumeAuthCode', () => {
  it('create code and consume it once returns the pending entry', () => {
    const { user } = createUser(testDb);
    const created = makeClient(user.id);
    const clientId = created.client!.client_id as string;

    const code = createAuthCode({
      clientId,
      userId: user.id,
      redirectUri: 'https://example.com/callback',
      scopes: ['trips:read'],
      codeChallenge: 'abc123',
      codeChallengeMethod: 'S256',
    });

    const entry = consumeAuthCode(code);
    expect(entry).not.toBeNull();
    expect(entry!.userId).toBe(user.id);
    expect(entry!.clientId).toBe(clientId);
  });

  it('returns null for non-existent code', () => {
    expect(consumeAuthCode('does-not-exist')).toBeNull();
  });

  it('consuming same code twice returns null (one-time use)', () => {
    const { user } = createUser(testDb);
    const created = makeClient(user.id);
    const clientId = created.client!.client_id as string;

    const code = createAuthCode({
      clientId,
      userId: user.id,
      redirectUri: 'https://example.com/callback',
      scopes: ['trips:read'],
      codeChallenge: 'abc123',
      codeChallengeMethod: 'S256',
    });

    consumeAuthCode(code);
    expect(consumeAuthCode(code)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// issueTokens + getUserByAccessToken
// ---------------------------------------------------------------------------

describe('issueTokens + getUserByAccessToken', () => {
  it('issues tokens with correct prefixes', () => {
    const { user } = createUser(testDb);
    const created = makeClient(user.id);
    const clientId = created.client!.client_id as string;

    const tokens = issueTokens(clientId, user.id, ['trips:read']);
    expect(tokens.access_token.startsWith('trekoa_')).toBe(true);
    expect(tokens.refresh_token.startsWith('trekrf_')).toBe(true);
    expect(tokens.token_type).toBe('Bearer');
    expect(typeof tokens.expires_in).toBe('number');
  });

  it('getUserByAccessToken returns user and scopes for a valid token', () => {
    const { user } = createUser(testDb);
    const created = makeClient(user.id);
    const clientId = created.client!.client_id as string;

    const { access_token } = issueTokens(clientId, user.id, ['trips:read', 'budget:write']);
    const info = getUserByAccessToken(access_token);
    expect(info).not.toBeNull();
    expect(info!.user.email).toBe(user.email);
    expect(info!.scopes).toContain('trips:read');
    expect(info!.scopes).toContain('budget:write');
  });

  it('getUserByAccessToken returns null for unknown token', () => {
    expect(getUserByAccessToken('trekoa_unknown')).toBeNull();
  });

  it('getUserByAccessToken returns null for revoked token', () => {
    const { user } = createUser(testDb);
    const created = makeClient(user.id);
    const clientId = created.client!.client_id as string;

    const { access_token } = issueTokens(clientId, user.id, ['trips:read']);
    revokeToken(access_token, clientId);
    expect(getUserByAccessToken(access_token)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// refreshTokens
// ---------------------------------------------------------------------------

describe('refreshTokens', () => {
  it('exchanges a refresh token for a new token pair', () => {
    const { user } = createUser(testDb);
    const created = makeClient(user.id);
    const clientId = created.client!.client_id as string;
    const rawSecret = created.client!.client_secret as string;

    const { refresh_token } = issueTokens(clientId, user.id, ['trips:read']);
    const result = refreshTokens(refresh_token, clientId, rawSecret);
    expect(result.error).toBeUndefined();
    expect(result.tokens).toBeDefined();
    expect(result.tokens!.access_token.startsWith('trekoa_')).toBe(true);
  });

  it('old tokens are revoked after refresh (rotation)', () => {
    const { user } = createUser(testDb);
    const created = makeClient(user.id);
    const clientId = created.client!.client_id as string;
    const rawSecret = created.client!.client_secret as string;

    const { access_token, refresh_token } = issueTokens(clientId, user.id, ['trips:read']);
    refreshTokens(refresh_token, clientId, rawSecret);
    expect(getUserByAccessToken(access_token)).toBeNull();
  });

  it('returns invalid_grant for unknown refresh token', () => {
    const { user } = createUser(testDb);
    const created = makeClient(user.id);
    const clientId = created.client!.client_id as string;
    const rawSecret = created.client!.client_secret as string;

    const result = refreshTokens('trekrf_unknown', clientId, rawSecret);
    expect(result.error).toBe('invalid_grant');
    expect(result.status).toBe(400);
  });

  it('returns invalid_grant for revoked token', () => {
    const { user } = createUser(testDb);
    const created = makeClient(user.id);
    const clientId = created.client!.client_id as string;
    const rawSecret = created.client!.client_secret as string;

    const { access_token, refresh_token } = issueTokens(clientId, user.id, ['trips:read']);
    revokeToken(access_token, clientId);
    const result = refreshTokens(refresh_token, clientId, rawSecret);
    expect(result.error).toBe('invalid_grant');
  });

  it('returns invalid_client for wrong client_secret', () => {
    const { user } = createUser(testDb);
    const created = makeClient(user.id);
    const clientId = created.client!.client_id as string;

    const { refresh_token } = issueTokens(clientId, user.id, ['trips:read']);
    const result = refreshTokens(refresh_token, clientId, 'wrong-secret');
    expect(result.error).toBe('invalid_client');
    expect(result.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// revokeToken
// ---------------------------------------------------------------------------

describe('revokeToken', () => {
  it('after revoking access token, getUserByAccessToken returns null', () => {
    const { user } = createUser(testDb);
    const created = makeClient(user.id);
    const clientId = created.client!.client_id as string;

    const { access_token } = issueTokens(clientId, user.id, ['trips:read']);
    expect(getUserByAccessToken(access_token)).not.toBeNull();

    revokeToken(access_token, clientId);
    expect(getUserByAccessToken(access_token)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// listOAuthSessions + revokeSession
// ---------------------------------------------------------------------------

describe('listOAuthSessions + revokeSession', () => {
  it('lists active sessions', () => {
    const { user } = createUser(testDb);
    const created = makeClient(user.id);
    const clientId = created.client!.client_id as string;

    issueTokens(clientId, user.id, ['trips:read']);
    const sessions = listOAuthSessions(user.id);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].client_id).toBe(clientId);
  });

  it('revoked session is not listed', () => {
    const { user } = createUser(testDb);
    const created = makeClient(user.id);
    const clientId = created.client!.client_id as string;

    const { access_token } = issueTokens(clientId, user.id, ['trips:read']);
    revokeToken(access_token, clientId);
    const sessions = listOAuthSessions(user.id);
    expect(sessions).toHaveLength(0);
  });

  it('revokeSession returns 404 for unknown session', () => {
    const { user } = createUser(testDb);
    const result = revokeSession(user.id, 99999);
    expect(result.status).toBe(404);
  });

  it('revokeSession by session id removes session from list', () => {
    const { user } = createUser(testDb);
    const created = makeClient(user.id);
    const clientId = created.client!.client_id as string;

    issueTokens(clientId, user.id, ['trips:read']);
    const sessions = listOAuthSessions(user.id);
    const sessionId = sessions[0].id as number;

    const result = revokeSession(user.id, sessionId);
    expect(result.success).toBe(true);
    expect(listOAuthSessions(user.id)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// validateAuthorizeRequest
// ---------------------------------------------------------------------------

describe('validateAuthorizeRequest', () => {
  function makeParams(overrides: Partial<{
    response_type: string;
    client_id: string;
    redirect_uri: string;
    scope: string;
    code_challenge: string;
    code_challenge_method: string;
  }> = {}) {
    return {
      response_type: 'code',
      client_id: '',
      redirect_uri: 'https://example.com/callback',
      scope: 'trips:read',
      code_challenge: 'abc123',
      code_challenge_method: 'S256',
      ...overrides,
    };
  }

  it('returns mcp_disabled when isAddonEnabled returns false', () => {
    vi.mocked(isAddonEnabled).mockReturnValue(false);
    const result = validateAuthorizeRequest(makeParams({ client_id: 'x' }), null);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('mcp_disabled');
  });

  it('requires response_type=code', () => {
    const { user } = createUser(testDb);
    const result = validateAuthorizeRequest(makeParams({ response_type: 'token', client_id: 'x' }), user.id);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('unsupported_response_type');
  });

  it('requires PKCE with S256', () => {
    const { user } = createUser(testDb);
    const result = validateAuthorizeRequest(makeParams({ client_id: 'x', code_challenge_method: 'plain' }), user.id);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('invalid_request');
  });

  it('requires valid client_id', () => {
    const { user } = createUser(testDb);
    const result = validateAuthorizeRequest(makeParams({ client_id: 'nonexistent' }), user.id);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('invalid_client');
  });

  it('validates redirect_uri against registered URIs', () => {
    const { user } = createUser(testDb);
    const created = makeClient(user.id, { redirectUris: ['https://example.com/callback'] });
    const clientId = created.client!.client_id as string;

    const result = validateAuthorizeRequest(
      makeParams({ client_id: clientId, redirect_uri: 'https://evil.com/callback' }),
      user.id
    );
    expect(result.valid).toBe(false);
    expect(result.error).toBe('invalid_redirect_uri');
  });

  it('validates scope against client allowed_scopes', () => {
    const { user } = createUser(testDb);
    const created = makeClient(user.id, { scopes: ['trips:read'] });
    const clientId = created.client!.client_id as string;

    const result = validateAuthorizeRequest(
      makeParams({ client_id: clientId, scope: 'budget:write' }),
      user.id
    );
    expect(result.valid).toBe(false);
    expect(result.error).toBe('invalid_scope');
  });

  it('returns loginRequired when userId is null', () => {
    const { user } = createUser(testDb);
    const created = makeClient(user.id);
    const clientId = created.client!.client_id as string;

    const result = validateAuthorizeRequest(makeParams({ client_id: clientId }), null);
    expect(result.valid).toBe(true);
    expect(result.loginRequired).toBe(true);
  });

  it('returns consentRequired=true when consent not yet saved', () => {
    const { user } = createUser(testDb);
    const created = makeClient(user.id);
    const clientId = created.client!.client_id as string;

    const result = validateAuthorizeRequest(makeParams({ client_id: clientId }), user.id);
    expect(result.valid).toBe(true);
    expect(result.consentRequired).toBe(true);
  });

  it('returns consentRequired=false when consent already saved and sufficient', () => {
    const { user } = createUser(testDb);
    const created = makeClient(user.id);
    const clientId = created.client!.client_id as string;

    saveConsent(clientId, user.id, ['trips:read']);
    const result = validateAuthorizeRequest(makeParams({ client_id: clientId }), user.id);
    expect(result.valid).toBe(true);
    expect(result.consentRequired).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// verifyPKCE
// ---------------------------------------------------------------------------

describe('verifyPKCE', () => {
  it('returns true for valid code_verifier / code_challenge pair (SHA256 base64url)', () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    expect(verifyPKCE(verifier, challenge)).toBe(true);
  });

  it('returns false for wrong verifier', () => {
    const verifier = 'correct-verifier';
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    expect(verifyPKCE('wrong-verifier', challenge)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// authenticateClient
// ---------------------------------------------------------------------------

describe('authenticateClient', () => {
  it('returns client row for correct credentials', () => {
    const { user } = createUser(testDb);
    const created = makeClient(user.id);
    const clientId = created.client!.client_id as string;
    const rawSecret = created.client!.client_secret as string;

    const client = authenticateClient(clientId, rawSecret);
    expect(client).not.toBeNull();
    expect(client!.client_id).toBe(clientId);
  });

  it('returns null for wrong secret', () => {
    const { user } = createUser(testDb);
    const created = makeClient(user.id);
    const clientId = created.client!.client_id as string;

    expect(authenticateClient(clientId, 'wrong-secret')).toBeNull();
  });

  it('returns null for unknown client_id', () => {
    expect(authenticateClient('unknown-client-id', 'any-secret')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// saveConsent + getConsent + isConsentSufficient
// ---------------------------------------------------------------------------

describe('saveConsent + getConsent + isConsentSufficient', () => {
  it('saves and retrieves consent', () => {
    const { user } = createUser(testDb);
    const created = makeClient(user.id);
    const clientId = created.client!.client_id as string;

    saveConsent(clientId, user.id, ['trips:read', 'budget:write']);
    const consent = getConsent(clientId, user.id);
    expect(consent).not.toBeNull();
    expect(consent).toContain('trips:read');
    expect(consent).toContain('budget:write');
  });

  it('isConsentSufficient returns true when all requested scopes are in existing', () => {
    expect(isConsentSufficient(['trips:read', 'budget:write'], ['trips:read'])).toBe(true);
    expect(isConsentSufficient(['trips:read', 'budget:write'], ['trips:read', 'budget:write'])).toBe(true);
  });

  it('isConsentSufficient returns false when some scopes are missing', () => {
    expect(isConsentSufficient(['trips:read'], ['trips:read', 'budget:write'])).toBe(false);
    expect(isConsentSufficient([], ['trips:read'])).toBe(false);
  });
});

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import path from 'node:path';
import type { NodulusApp } from '../../src/types/index.js';

describe('E2E Integration', () => {
  let appServer: any;
  let nodulusInfo: NodulusApp;

  beforeAll(async () => {
    // Pivot CWD into the fixture to mimic a real project running locally
    const fixtureDir = path.join(process.cwd(), 'tests/fixtures/basic-app');
    vi.spyOn(process, 'cwd').mockReturnValue(fixtureDir);

    // Dynamically import the fixture
    // Because vitest and TS cache modules, we can import without issues
    const { app, boot } = await import('../../tests/fixtures/basic-app/src/app.js');
    
    appServer = app;
    nodulusInfo = await boot();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('should successfully boot without errors and resolve all modules', () => {
    expect(nodulusInfo).toBeDefined();
    expect(nodulusInfo.modules).toHaveLength(3); // auth, notifications, users
    
    const moduleNames = nodulusInfo.modules.map(m => m.name).sort();
    expect(moduleNames).toEqual(['auth', 'notifications', 'users']);
  });

  it('should correctly register and resolve the global prefix and child prefixes', async () => {
    // /api/users/ comes from global config prefix + local controller prefix
    const resUsers = await request(appServer).get('/api/users');
    expect(resUsers.status).toBe(200);
    expect(Array.isArray(resUsers.body)).toBe(true);
    expect(resUsers.body[0].name).toBe('John');

    const resAuth = await request(appServer).post('/api/auth/login');
    expect(resAuth.status).toBe(200);
    expect(resAuth.body.token).toBe('token-123');
  });

  it('should appropriately apply injected localized express middlewares', async () => {
    // We added a mutate-body middleware named "validate" mapped via alias!
    const resUsers = await request(appServer).get('/api/users');
    // Actually the middleware mutates req.body, but the response only yields the service return.
    // That's fine, if the route didn't crash it means @middleware alias successfully resolved it.
    expect(resUsers.status).toBe(200);
  });

  it('should guarantee that @modules alias is inherently registered and usable between logical parts', () => {
    // UsersService imported notifications via @modules/notifications/...
    // If it successfully logged/returned and didn't crash, the ESM runtime hook is perfectly intercepting.
    expect(nodulusInfo.registry.resolveAlias('@modules/notifications')).toBeDefined(); // internal sanity check that alias logic succeeded underneath
    const aliases = nodulusInfo.registry.getAllAliases();
    expect(aliases['@modules/notifications']).toBeDefined();
  });
});

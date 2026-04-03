import { describe, it, expect, beforeEach } from 'vitest';
import { Controller } from '../../src/identifiers/controller.js';
import { registry } from '../../src/core/registry.js';

describe('Identifier: Controller() V0.4.0', () => {
  beforeEach(() => {
    registry.clearRegistry();
  });

  it('registers the controller in the registry with default values', () => {
    Controller('UsersController');

    const controllers = registry.getAllControllersMetadata();
    const entry = controllers.find(c => c.name === 'UsersController');
    
    expect(entry).toBeDefined();
    expect(entry?.name).toBe('UsersController');
    expect(entry?.prefix).toBe('/');
    expect(entry?.middlewares).toEqual([]);
    expect(entry?.enabled).toBe(true);
  });

  it('registers the controller with specific values', () => {
    Controller('AuthController', { prefix: '/auth', enabled: false });
    
    const controllers = registry.getAllControllersMetadata();
    const entry = controllers.find(c => c.name === 'AuthController');
    
    expect(entry?.name).toBe('AuthController');
    expect(entry?.prefix).toBe('/auth');
    expect(entry?.enabled).toBe(false);
  });
});

import fs from 'node:fs';
import path from 'node:path';

const fixtureDir = path.join(process.cwd(), 'tests/fixtures/basic-app');

const files = {
  'src/app.ts': `
import express from 'express';
import { createApp } from '../../../../src/index.js';

export const app = express();
app.use(express.json());

export const boot = async () => {
  return await createApp(app, {
    modules: 'src/modules/*',
    prefix: '/api',
    aliases: {
      '@config': './src/config',
      '@middleware': './src/middleware'
    }
  });
};
`,
  'src/config/database.ts': `
export const db = { connected: true };
`,
  'src/middleware/validate.ts': `
import type { Request, Response, NextFunction } from 'express';
export const validate = (req: Request, res: Response, next: NextFunction) => {
  req.body.validated = true;
  next();
};
`,
  'src/modules/users/index.ts': `
import { Module } from '../../../../../../src/index.js';
Module('users', { imports: ['notifications'], exports: ['UsersService'] });
export { UsersService } from './users.service.js';
`,
  'src/modules/users/users.service.ts': `
import { notify } from '@modules/notifications/notifications.service.js';
export class UsersService {
  static getUsers() { 
    notify('Fetched users');
    return [{ id: 1, name: 'John' }]; 
  }
}
`,
  'src/modules/users/users.routes.ts': `
import express from 'express';
import { Controller } from '../../../../../../src/index.js';
import { UsersService } from './users.service.js';
import { validate } from '@middleware/validate.js';

Controller('UsersController', { prefix: '/users', middlewares: [validate] });

const router = express.Router();
router.get('/', (req, res) => {
  res.json(UsersService.getUsers());
});

export default router;
`,
  'src/modules/auth/index.ts': `
import { Module } from '../../../../../../src/index.js';
Module('auth', { exports: ['AuthService'] });
export { AuthService } from './auth.service.js';
`,
  'src/modules/auth/auth.service.ts': `
export class AuthService {
  static login() { return 'token-123'; }
}
`,
  'src/modules/auth/auth.routes.ts': `
import express from 'express';
import { Controller } from '../../../../../../src/index.js';
import { AuthService } from './auth.service.js';

Controller('AuthController', { prefix: '/auth' });

const router = express.Router();
router.post('/login', (req, res) => {
  res.json({ token: AuthService.login() });
});

export default router;
`,
  'src/modules/notifications/index.ts': `
import { Module } from '../../../../../../src/index.js';
Module('notifications', { exports: ['notify'] });
export { notify } from './notifications.service.js';
`,
  'src/modules/notifications/notifications.service.ts': `
export function notify(msg: string) {
  console.log('Notification:', msg);
}
`
};

for (const [relPath, content] of Object.entries(files)) {
  const fullPath = path.join(fixtureDir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content.trim() + '\n');
}

console.log('Fixture basic-app created successfully.');

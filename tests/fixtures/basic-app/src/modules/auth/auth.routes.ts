import express from 'express';
import { Controller } from '../../../../../../src/index.js';
import { AuthService } from './auth.service.js';

Controller('AuthController', { prefix: '/auth' });

const router = express.Router();
router.post('/login', (req, res) => {
  res.json({ token: AuthService.login() });
});

export default router;

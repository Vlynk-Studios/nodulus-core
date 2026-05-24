import { Controller } from '@vlynk-studios/nodulus-core';
import { Router } from 'express';
import { AuthService } from '@modules/auth';
import { UsersService } from './index.js';

Controller('/users');
const router = Router();

router.get('/', (req, res) => {
  const auth = new AuthService();
  const users = new UsersService();
  if (auth.isAuthenticated()) {
    res.json(users.getUsers());
  } else {
    res.status(401).send('Unauthorized');
  }
});

export default router;

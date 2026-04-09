import express from 'express';
import { Controller } from '../../../../../../src/index.js';
import { UsersService } from './users.service.js';
import { validate } from '@middleware/validate.js';

Controller('/users', { middlewares: [validate] });

const router = express.Router();
router.get('/', (req, res) => {
  res.json(UsersService.getUsers());
});

export default router;

import { Module } from '../../../../../../src/index.js';
Module('users', { imports: ['notifications'], exports: ['UsersService'] });
export { UsersService } from './users.service.js';

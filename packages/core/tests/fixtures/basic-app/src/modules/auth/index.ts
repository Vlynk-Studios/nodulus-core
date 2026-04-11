import { Module } from '../../../../../../src/index.js';
Module('auth', { exports: ['AuthService'] });
export { AuthService } from './auth.service.js';

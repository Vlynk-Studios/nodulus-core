import { Module } from '../../../../../../src/index.js';
Module('notifications', { exports: ['notify'] });
export { notify } from './notifications.service.js';

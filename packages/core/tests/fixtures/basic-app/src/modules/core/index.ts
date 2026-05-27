import { Module } from '../../../../../../src/index.js';

Module('core', { exports: ['CoreService'] });

export class CoreService {
  getData() {
    return 'core-data';
  }
}

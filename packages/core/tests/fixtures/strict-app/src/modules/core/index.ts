import { Module } from '@vlynk-studios/nodulus-core';

Module('core', {
  exports: ['CoreService']
});

export class CoreService {
  getData() {
    return 'core-data';
  }
}

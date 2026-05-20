import { Module } from '@vlynk-studios/nodulus-core';

Module('auth', {
  imports: ['core'],
  exports: ['AuthService']
});

export class AuthService {
  isAuthenticated() {
    return true;
  }
}

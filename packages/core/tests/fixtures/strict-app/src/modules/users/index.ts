import { Module } from '@vlynk-studios/nodulus-core';

Module('users', {
  imports: ['auth'],
  exports: ['UsersService']
});

export class UsersService {
  getUsers() {
    return [{ id: 1, name: 'Alice' }];
  }
}

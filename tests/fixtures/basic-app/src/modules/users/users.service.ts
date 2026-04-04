import { notify } from '@modules/notifications/notifications.service.js';
export class UsersService {
  static getUsers() { 
    notify('Fetched users');
    return [{ id: 1, name: 'John' }]; 
  }
}

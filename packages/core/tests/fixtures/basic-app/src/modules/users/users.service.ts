import { notify } from '@modules/notifications/index.js';
export class UsersService {
  static getUsers() { 
    notify('Fetched users');
    return [{ id: 1, name: 'John' }]; 
  }
}

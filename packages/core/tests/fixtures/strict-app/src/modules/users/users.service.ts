import { AuthService } from '@modules/auth';

// Secondary file: uses @modules/auth which users declares in imports[]
export class UsersService {
  private auth = new AuthService();

  getUsers() {
    if (this.auth.isAuthenticated()) {
      return [{ id: 1, name: 'Alice' }];
    }
    return [];
  }
}

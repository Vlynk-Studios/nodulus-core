import { CoreService } from '@modules/core';

// This secondary file uses @modules/core which auth declares in imports[]
export class AuthService {
  private core = new CoreService();

  isAuthenticated() {
    return !!this.core.getData();
  }
}

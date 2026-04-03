export class ModularError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'ModularError';
    this.code = code;
  }
}

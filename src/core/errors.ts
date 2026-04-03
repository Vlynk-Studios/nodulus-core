export class NodulusError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'NodulusError';
    this.code = code;
  }
}

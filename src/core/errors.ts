export type NodulusErrorCode =
  | 'MODULE_NOT_FOUND'
  | 'DUPLICATE_MODULE'
  | 'MISSING_IMPORT'
  | 'UNDECLARED_IMPORT'
  | 'CIRCULAR_DEPENDENCY'
  | 'EXPORT_MISMATCH'
  | 'INVALID_CONTROLLER'
  | 'ALIAS_NOT_FOUND'
  | 'DUPLICATE_BOOTSTRAP'

export class NodulusError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'NodulusError';
    this.code = code;
  }
}

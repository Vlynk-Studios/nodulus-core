export type NodulusErrorCode =
  | "MODULE_NOT_FOUND"
  | "DUPLICATE_MODULE"
  | "MISSING_IMPORT"
  | "UNDECLARED_IMPORT"
  | "CIRCULAR_DEPENDENCY"
  | "EXPORT_MISMATCH"
  | "INVALID_CONTROLLER"
  | "ALIAS_NOT_FOUND"
  | "DUPLICATE_ALIAS"
  | "DUPLICATE_BOOTSTRAP"
  | "REGISTRY_MISSING_CONTEXT"
  | "INVALID_MODULE_DECLARATION"
  | "DUPLICATE_SERVICE"
  | "DUPLICATE_REPOSITORY"
  | "DUPLICATE_SCHEMA";

export class NodulusError extends Error {
  readonly code: NodulusErrorCode;
  readonly details?: string;

  constructor(code: NodulusErrorCode, message: string, details?: string) {
    super(message);
    this.name = "NodulusError";
    this.code = code;
    this.details = details;
  }
}

export const ERROR_MESSAGES: Record<NodulusErrorCode, string> = {
  MODULE_NOT_FOUND:    "This folder was discovered but index.ts does not call Module(). Add Module('name') to the top of index.ts.",
  DUPLICATE_MODULE:    "A module with this name or path already exists. Ensure every module name is unique across the app.",
  MISSING_IMPORT:      "A module listed in 'imports' does not exist in the registry. Verify the module name exists and its index.ts calls Module().",
  UNDECLARED_IMPORT:   "Attempted to import a module not listed in this module's 'imports' field. Add the missing dependency to Module() options.",
  CIRCULAR_DEPENDENCY: "A circular dependency chain was detected. Extract shared logic into a third module to break the cycle.",
  EXPORT_MISMATCH:     "A name declared in 'exports' is not a real export of index.ts. Ensure you 'export { ... }' the matching member.",
  INVALID_CONTROLLER:  "Controller has no default export of an Express Router. Add 'export default router;' to the controller file.",
  ALIAS_NOT_FOUND:     "An alias points to a target directory that does not exist. Verify the path in nodulus.config.ts or createApp() options.",
  DUPLICATE_ALIAS:     "An alias with this name is already registered to a different path. Check for naming collisions in your config.",
  DUPLICATE_BOOTSTRAP:        "createApp() was called more than once with the same Express instance. Reuse the existing NodulusApp instead.",
  REGISTRY_MISSING_CONTEXT:   "No active registry found in the current async context. Ensure Nodulus API calls run within a createApp() scope.",
  INVALID_MODULE_DECLARATION: "The Module() call violates architectural rules. Ensure it's called at the top level of index.ts.",
  DUPLICATE_SERVICE:          "A service with this name is already registered. Ensure every Service() name is unique within the same module.",
  DUPLICATE_REPOSITORY:       "A repository with this name is already registered. Ensure every Repository() name is unique within the same module.",
  DUPLICATE_SCHEMA:           "A schema with this name is already registered. Ensure every Schema() name is unique within the same module.",
};

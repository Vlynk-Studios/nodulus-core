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
  | "REGISTRY_MISSING_CONTEXT";

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
  MODULE_NOT_FOUND:    "No index.ts found calling Module(). Add Module() to the module's index.ts.",
  DUPLICATE_MODULE:    "A module with this name already exists. Each module must have a unique name.",
  MISSING_IMPORT:      "A module declared in imports does not exist in the registry.",
  UNDECLARED_IMPORT:   "A module imports from another not listed in its imports field (strict mode only).",
  CIRCULAR_DEPENDENCY: "Circular dependency detected. Extract the shared dependency into a separate module.",
  EXPORT_MISMATCH:     "A name declared in exports does not exist as a real export of index.ts.",
  INVALID_CONTROLLER:  "Controller has no default export of a Router. Add export default router.",
  ALIAS_NOT_FOUND:     "Alias is configured but the target directory does not exist.",
  DUPLICATE_ALIAS:     "An alias with this name is already registered to a different target path.",
  DUPLICATE_BOOTSTRAP:        "createApp() was called more than once with the same Express instance.",
  REGISTRY_MISSING_CONTEXT:   "No active registry found in the current async context. Ensure code runs inside a createApp() execution scope.",
};

// ESM loader hook for Node.js
export async function resolve(specifier: string, context: any, defaultResolve: any): Promise<any> {
  return defaultResolve(specifier, context, defaultResolve);
}

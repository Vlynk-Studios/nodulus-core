import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generatePathAliases } from '../../src/cli/lib/tsconfig-generator.js';

// Simple mock for sync logic since it's hard to trigger the full CLI command in unit tests without a lot of setup
const simulateCleanup = (paths: Record<string, string[]>, pathsObj: Record<string, string[]>) => {
  const currentKeys = new Set(Object.keys(pathsObj));
  const newPaths = { ...paths };

  for (const key of Object.keys(newPaths)) {
    if (currentKeys.has(key)) continue;

    const val = newPaths[key];
    const isNodulusModule = key.startsWith('@modules/');
    
    // Heuristic duplicated from sync-tsconfig.ts
    const isStaleFolderAlias = 
      key.startsWith('@') && 
      Array.isArray(val) && 
      val.length === 1 && 
      typeof val[0] === 'string' && 
      (
        (key.endsWith('/*') && val[0].endsWith('/*')) || 
        (newPaths[`${key}/*`] !== undefined)
      );

    if (isNodulusModule || isStaleFolderAlias) {
      delete newPaths[key];
    }
  }
  return newPaths;
};

describe('P5 tsconfig Sync Robustness', () => {
    
    it('should generate dual mapping and resolve index for directories', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nodulus-p5-1-'));
        const configDir = path.join(tmpDir, 'src/config');
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(path.join(configDir, 'index.ts'), 'export default {}');

        const config = {
            aliases: {
                '@config': './src/config'
            }
        };

        const result = await generatePathAliases(config as any, tmpDir);
        
        expect(result['@config']).toEqual(['./src/config/index.ts']);
        expect(result['@config/*']).toEqual(['./src/config/*']);

        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should handle directory aliases without index file', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nodulus-p5-2-'));
        const sharedDir = path.join(tmpDir, 'shared');
        fs.mkdirSync(sharedDir, { recursive: true });

        const config = {
            aliases: {
                '@shared': './shared'
            }
        };

        const result = await generatePathAliases(config as any, tmpDir);
        
        expect(result['@shared']).toEqual(['./shared']);
        expect(result['@shared/*']).toEqual(['./shared/*']);

        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should NOT generate dual mapping for files', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nodulus-p5-3-'));
        const dbFile = path.join(tmpDir, 'db.ts');
        fs.writeFileSync(dbFile, 'export const db = {}');

        const config = {
            aliases: {
                '@db': './db.ts'
            }
        };

        const result = await generatePathAliases(config as any, tmpDir);
        
        expect(result['@db']).toEqual(['./db.ts']);
        expect(result['@db/*']).toBeUndefined();

        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    describe('Cleanup logic', () => {
        it('should remove stale module and folder aliases', () => {
            const existingPaths = {
                '@modules/old': ['./src/modules/old/index.ts'],
                '@stale': ['./src/stale'],
                '@stale/*': ['./src/stale/*'],
                '@user-manual': ['./manual/path'] // Should be preserved
            };

            const activePathsObj = {
                '@modules/new': ['./src/modules/new/index.ts']
            };

            const cleaned = simulateCleanup(existingPaths, activePathsObj);

            expect(cleaned).not.toHaveProperty('@modules/old');
            expect(cleaned).not.toHaveProperty('@stale');
            expect(cleaned).not.toHaveProperty('@stale/*');
            expect(cleaned).toHaveProperty('@user-manual');
        });

        it('should NOT remove user aliases that do not match Nodulus pattern', () => {
             const existingPaths = {
                'external-lib': ['node_modules/external-lib'],
                '@app': ['./src/app.ts']
            };

            const activePathsObj = {};
            const cleaned = simulateCleanup(existingPaths, activePathsObj);

            expect(cleaned).toHaveProperty('external-lib');
            expect(cleaned).toHaveProperty('@app');
        });
    });
});

import pc from 'picocolors';
import type { ReconciliationResult } from '../types/nits.js';
import type { Logger } from '../core/logger.js';
import { calculateAlias } from './utils.js';

export function reportReconciliation(result: ReconciliationResult, log: Logger): void {
  const total = 
    result.confirmed.length + 
    result.moved.length + 
    result.candidates.length +
    result.stale.length + 
    result.newModules.length;
    
  if (total === 0) return;

  // Detailed Move Reports (English)
  if (result.moved.length > 0) {
    for (const m of result.moved) {
      const newAlias = calculateAlias(m.newPath);
      let msg = `Move detected: '${pc.bold(m.record.name)}'\n`;
      msg += `           ${pc.gray('Before:')} ${pc.gray(m.oldPath)}\n`;
      msg += `           ${pc.gray('After:')}  ${pc.cyan(m.newPath)}`;
      
      if (m.brokenImports.length > 0) {
        msg += `\n           ${pc.yellow(`Broken imports (${m.brokenImports.length} file(s)):`)}`;
        for (const imp of m.brokenImports) {
          msg += `\n             ${pc.gray(imp.file)}:${pc.gray(String(imp.line))}  →  ${pc.red(imp.specifier)}`;
        }
        msg += `\n           Update imports to: ${pc.green(newAlias)}`;
      }
      
      log.warn(msg);
    }
  }

  // Summary (Console style as before, but using log.info/debug)
  log.debug(pc.cyan('[NITS] Identity Reconciliation Summary'));
  log.debug(pc.gray('----------------------------------------'));
  
  if (result.confirmed.length > 0) {
    log.debug(`${pc.green('✔')} Confirmed:      ${pc.bold(result.confirmed.length)}`);
  }
  
  if (result.newModules.length > 0) {
    log.debug(`${pc.blue('✳')} New modules:    ${pc.bold(result.newModules.length)}`);
  }
  
  if (result.moved.length > 0) {
    log.debug(`${pc.magenta('⇄')} Moved:          ${pc.bold(result.moved.length)}`);
  }
  
  if (result.candidates.length > 0) {
    log.debug(`${pc.yellow('❓')} Candidates:     ${pc.bold(result.candidates.length)}`);
  }
  
  if (result.stale.length > 0) {
    log.debug(`${pc.gray('✖')} Stale (disk):  ${pc.bold(result.stale.length)}`);
  }
  
  log.debug(pc.gray('----------------------------------------\n'));
}

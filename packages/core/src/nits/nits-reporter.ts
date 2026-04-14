import pc from 'picocolors';
import type { ReconciliationResult } from '../types/nits.js';

export function reportReconciliation(result: ReconciliationResult): void {
  const total = 
    result.confirmed.length + 
    result.moved.length + 
    result.stale.length + 
    result.newModules.length;
    
  if (total === 0) return;

  console.log(pc.cyan('\n[NITS] Identity Reconciliation Summary'));
  console.log(pc.gray('----------------------------------------'));
  
  if (result.confirmed.length > 0) {
    console.log(`${pc.green('✔')} Confirmed:      ${pc.bold(result.confirmed.length)}`);
  }
  
  if (result.newModules.length > 0) {
    console.log(`${pc.blue('✳')} New modules:    ${pc.bold(result.newModules.length)}`);
  }
  
  if (result.moved.length > 0) {
    console.log(`${pc.magenta('⇄')} Moved/Moved:    ${pc.bold(result.moved.length)}`);
  }
  
  if (result.stale.length > 0) {
    console.log(`${pc.gray('✖')} Stale (disk):  ${pc.bold(result.stale.length)}`);
  }
  
  console.log(pc.gray('----------------------------------------\n'));
}

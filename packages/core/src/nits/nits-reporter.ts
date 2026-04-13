import pc from 'picocolors';
import type { ReconciliationSummary } from '../types/nits.js';

export function reportReconciliation(summary: ReconciliationSummary): void {
  console.log(pc.cyan('\n[NITS] Identity Reconciliation Summary'));
  console.log(pc.gray('----------------------------------------'));
  console.log(`${pc.green('✔')} New modules:      ${pc.bold(summary.newModules)}`);
  console.log(`${pc.magenta('⇄')} Moved modules:    ${pc.bold(summary.movedModules)}`);
  console.log(`${pc.yellow('⛑')} Healed conflicts: ${pc.bold(summary.healedConflicts)}`);
  console.log(pc.gray('----------------------------------------\n'));
}

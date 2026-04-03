const { Module, Controller, createApp } = require('../../dist/index.cjs');

console.log('[CJS] Library imported successfully!');

try {
  Module('cjs-auth', { exports: [] });
  console.log('[CJS] Module() executed successfully!');

  Controller('UsersController', { prefix: '/users' });
  console.log('[CJS] Controller() executed successfully!');

  // Simple mock checks
  if (typeof createApp === 'function') {
    console.log('[CJS] createApp is loaded and valid!');
    console.log('[CJS] ALL CJS INTEGRATION CHECKS PASSED.');
  } else {
    throw new Error('createApp is not a function in CJS output');
  }

} catch (e) {
  console.error('[CJS] FAILED:', e);
  process.exit(1);
}

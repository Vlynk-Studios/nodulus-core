import { describe, it, expect } from 'vitest';
import { getModuleCallerInfo, getFileCallerInfo } from '../../src/core/caller.js';

describe('Caller Context Resolution', () => {
  it('should resolve caller file correctly using getFileCallerInfo', () => {
    // Wrap to simulate an identifier call depth
    function MockService(_name: string) {
      return getFileCallerInfo('Service');
    }
    
    function mockUserFile() {
      return MockService('UserService');
    }
    
    const info = mockUserFile();
    expect(info.filePath.replace(/\\/g, '/')).toContain('caller.test.ts');
  });

  it('should resolve caller directory correctly using getModuleCallerInfo', () => {
    function MockModule(_name: string) {
      return getModuleCallerInfo('Module');
    }

    function mockIndexFile() {
      return MockModule('users');
    }

    const info = mockIndexFile();
    expect(info.filePath.replace(/\\/g, '/')).toContain('caller.test.ts');
    expect(info.dirPath.replace(/\\/g, '/')).toContain('unit');
  });
});

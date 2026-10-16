const Module = require('node:module');
const originalLoad = Module._load;

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'expo-crypto') {
    return {
      randomUUID: () => 'test-uuid',
    };
  }

  return originalLoad.call(this, request, parent, isMain);
};

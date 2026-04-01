const Module = require("module");

const originalLoad = Module._load;
const targetSuffix = "startTypescriptTypeGeneration.js";

Module._load = function patchedLoad(request, parent, isMain) {
  const exported = originalLoad.apply(this, arguments);

  try {
    const resolved = Module._resolveFilename(request, parent, isMain);
    if (
      typeof resolved === "string" &&
      resolved.endsWith(targetSuffix) &&
      exported &&
      typeof exported.startTypescriptTypeGenerationAsync === "function"
    ) {
      return {
        ...exported,
        startTypescriptTypeGenerationAsync: async () => {},
      };
    }
  } catch {
    return exported;
  }

  return exported;
};

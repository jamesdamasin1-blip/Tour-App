const path = require("path");

const metroImplPath = require.resolve("react-native-css-interop/dist/metro/index.js");
const metroImplDir = path.dirname(metroImplPath);
const writableCacheDir = path.resolve(process.cwd(), "metro-cache", "react-native-css-interop");

const originalResolve = path.resolve;

path.resolve = function patchedResolve(...args) {
  if (
    args.length >= 2 &&
    args[0] === metroImplDir &&
    args[1] === "../../.cache"
  ) {
    return writableCacheDir;
  }

  return originalResolve.apply(path, args);
};

let exportsFromModule;
try {
  exportsFromModule = require("react-native-css-interop/metro");
} finally {
  path.resolve = originalResolve;
}

module.exports = exportsFromModule;

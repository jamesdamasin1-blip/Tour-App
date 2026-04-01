const { getDefaultConfig } = require("expo/metro-config");
const cssInteropMetroPath = require.resolve("react-native-css-interop/metro");
require.cache[cssInteropMetroPath] = {
  id: cssInteropMetroPath,
  filename: cssInteropMetroPath,
  loaded: true,
  exports: require("./metro-css-interop"),
};
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: "./global.css" });

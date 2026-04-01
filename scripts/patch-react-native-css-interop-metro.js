const fs = require("fs");
const path = require("path");

const targetFile = path.join(
  __dirname,
  "..",
  "node_modules",
  "react-native-css-interop",
  "dist",
  "metro",
  "index.js"
);

const originalNeedle =
  'const outputDirectory = path_1.default.resolve(__dirname, "../../.cache");';
const patchedLine =
  'const outputDirectory = path_1.default.resolve(process.cwd(), ".expo/react-native-css-interop");';

if (!fs.existsSync(targetFile)) {
  console.warn("[patch-css-interop] Target file not found:", targetFile);
  process.exit(0);
}

const source = fs.readFileSync(targetFile, "utf8");

if (source.includes(patchedLine)) {
  console.log("[patch-css-interop] Already patched.");
  process.exit(0);
}

if (!source.includes(originalNeedle)) {
  console.warn("[patch-css-interop] Expected source line not found; skipping patch.");
  process.exit(0);
}

fs.writeFileSync(targetFile, source.replace(originalNeedle, patchedLine));
console.log("[patch-css-interop] Patched Metro cache directory to .expo/react-native-css-interop");

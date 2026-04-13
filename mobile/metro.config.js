// metro.config.js
//
// Tells Metro to resolve modules from mobile/node_modules ONLY,
// not walk up to the monorepo root. Without this, Metro finds
// packages in the root node_modules that conflict with the mobile
// versions (e.g. expo/AppEntry.js instead of expo-router/entry).

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Only watch the mobile directory — don't walk up to the monorepo root
config.watchFolders = [__dirname];

// Resolve modules from mobile/node_modules only
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
];

// Explicitly block the root node_modules from resolution
config.resolver.blockList = [
  /\.\.\/node_modules\/.*/,
];

module.exports = config;

// mobile/babel.config.js
//
// Reanimated 4 moved its Babel plugin to `react-native-worklets/plugin`
// (the runtime that powers its JS-thread worklets). The plugin MUST be
// listed last so other transforms run before the worklet rewrite.
//
// Gesture-handler needs no Babel config — just a root import in the app
// entry and a `GestureHandlerRootView` at the top of the React tree.

module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-worklets/plugin'],
  };
};

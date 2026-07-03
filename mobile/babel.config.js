module.exports = function (api) {
  api.cache(true);
  return {
    // babel-preset-expo (SDK 56) auto-adds react-native-worklets/plugin when
    // installed, so do NOT also add react-native-reanimated/plugin here — a
    // second worklets transform corrupts worklet serialization and crashes
    // Reanimated at startup (SIGABRT in the worklets UI scheduler / Expo Go).
    presets: ['babel-preset-expo'],
  };
};

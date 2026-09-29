const { withAppBuildGradle } = require('@expo/config-plugins');

// SDK 54's Android template uses proguard-android.txt, which includes
// -dontoptimize. Keep the optimizing default across clean prebuilds/EAS Build.
module.exports = function withAndroidReleaseOptimization(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') {
      throw new Error('withAndroidReleaseOptimization requires a Groovy app/build.gradle.');
    }

    const defaultRules = /getDefaultProguardFile\(\s*(["'])proguard-android(?:-optimize)?\.txt\1\s*\)/g;
    if (!defaultRules.test(config.modResults.contents)) {
      throw new Error('Could not find Android default ProGuard rules; check the Expo Android template.');
    }
    config.modResults.contents = config.modResults.contents.replace(
      defaultRules,
      'getDefaultProguardFile("proguard-android-optimize.txt")'
    );
    return config;
  });
};

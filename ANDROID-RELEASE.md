# Android release configuration

This project uses Expo SDK 54, React Native 0.81.5, Hermes, and EAS Build with
Continuous Native Generation. `android/` and `ios/` are generated and ignored by
Git. Keep release settings in `app.json` and `app.template.json` so school-build
scripts and clean prebuilds retain them.

## Hotfix: release shrinking is off

Version 3.1.2 (20) was the first build with Android code shrinking and R8
optimization. That build rejects every `ExpoSecureStore.getValueWithKeyAsync`
call before the saved session is read:

```text
The 2nd argument cannot be cast to type expo.modules.securestore.SecureStoreOptions
(received class com.facebook.react.bridge.ReadableNativeMap)
Caused by: java.lang.NullPointerException
```

Expo converts the SecureStore options map in native code. `proguard-android-optimize.txt`
removes `-dontoptimize`, and R8 then breaks the `SecureStoreOptions` converter.
Login fails on Android release builds only. Debug builds and iOS are unaffected.

The hotfix turns both shrinker switches off and removes
`plugins/withAndroidReleaseOptimization.js`. Session tokens stay in SecureStore.
Do not re-enable minification, resource shrinking, or the optimizing ProGuard
file until a release APK can log in and read an existing SecureStore session.

`expo-build-properties` Android options for this hotfix:

```json
{
  "enableMinifyInReleaseBuilds": false,
  "enableShrinkResourcesInReleaseBuilds": false
}
```

These options belong inside the existing `expo-build-properties` plugin entry,
alongside its iOS options. SDK 54 reads `enableMinifyInReleaseBuilds`. The
default template ProGuard file remains `proguard-android.txt`, which includes
`-dontoptimize`.

`plugins/withAndroidSounds.js` still copies custom notification sounds into
`res/raw`. Its XML keep file is unused while resource shrinking is off, and it
stays so sounds survive if shrinking is turned back on later.

## Release build

From `SchoolIMS-Frontend`, use the existing school-specific release profile.
EAS `autoIncrement` assigns the next Android version code. The user-facing
version for this hotfix is `5.1.9`.

```bash
npx eas-cli build --platform android --profile school-17-production-apk --clear-cache
```

Confirm the generated `android/gradle.properties` contains:

```properties
android.enableMinifyInReleaseBuilds=false
android.enableShrinkResourcesInReleaseBuilds=false
```

The release `build.gradle` must keep `proguard-android.txt`, not
`proguard-android-optimize.txt`. `:app:minifyReleaseWithR8` should not run.
Install that APK and sign in with an account that already has a saved session,
then cold-start again and confirm the session is still there.

After that check, create the store bundle:

```bash
npx eas-cli build --platform android --profile school-17-production --clear-cache
```

These are native binary changes. An OTA update cannot undo R8 shrinking in an
already installed release.

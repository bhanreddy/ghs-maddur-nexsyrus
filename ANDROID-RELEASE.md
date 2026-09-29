# Android release shrinking and verification

This project uses Expo SDK 54, React Native 0.81.5, Hermes, and EAS Build with
Continuous Native Generation. `android/` and `ios/` are generated and ignored by
Git. Keep release settings in `app.json` and `app.template.json` so school-build
scripts and clean prebuilds retain them.

## Configuration

`expo-build-properties` is already installed (`~1.0.10`). Its Android options are:

```json
{
  "enableMinifyInReleaseBuilds": true,
  "enableShrinkResourcesInReleaseBuilds": true,
  "extraProguardRules": "# Retain source locations for retracing release crashes with mapping.txt.\n-keepattributes SourceFile,LineNumberTable"
}
```

These options belong inside the existing `expo-build-properties` plugin entry,
alongside its iOS options. `enableProguardInReleaseBuilds` is the older name;
SDK 54 uses `enableMinifyInReleaseBuilds`. The former top-level
`expo.android.enableShrinkResources` setting was removed because it does not
configure this SDK's release resource shrinker.

`plugins/withAndroidReleaseOptimization.js` changes the generated release
configuration to use `proguard-android-optimize.txt`. The SDK 54 template's
`proguard-android.txt` contains `-dontoptimize`, which would prevent R8's code
optimization even with minification enabled.

React Native, Expo modules, and native dependencies supply their consumer rules;
the generated app also retains its template's Reanimated/TurboModule rules.
The extra rule preserves source locations for crash retracing. No additional
project class keep rules were identified from the current native module code.
Avoid blanket keeps for all React Native, Expo, Firebase, or app classes, and
avoid `-dontobfuscate`, `-dontshrink`, `-dontoptimize`, or `-ignorewarnings`.

`plugins/withAndroidSounds.js` generates
`android/app/src/main/res/raw/schoolims_sounds_keep.xml`, preserving the
custom sounds copied from `assets/sounds`. Expo resolves these resources by
name from JavaScript/FCM payloads, so resource shrinking needs explicit XML keep
entries. Java ProGuard rules alone do not protect these resources.

References: [Expo SDK 54 build properties](https://docs.expo.dev/versions/v54.0.0/sdk/build-properties/),
[Expo native generation](https://docs.expo.dev/workflow/continuous-native-generation/),
[Android R8 optimization](https://developer.android.com/topic/performance/app-optimization/enable-app-optimization),
[Android resource keep files](https://developer.android.com/topic/performance/app-optimization/customize-which-resources-to-keep).

## Test with EAS Build

From `SchoolIMS-Frontend`, use the existing school-specific release APK profile:

```bash
npx eas-cli build --platform android --profile school-17-production-apk --clear-cache
```

This creates a release APK with the same shrinking settings as the store build.
The existing profile uses production channel/environment settings and increments
the remote Android version. Use a test device and avoid submitting this APK.
EAS will prebuild because the generated native directories are excluded from the
upload. If you later include `android/` in an EAS upload, regenerate it yourself;
EAS does not automatically prebuild an included native project.

Download and install the resulting APK, then follow the smoke checks below.
After testing, create the store AAB:

```bash
npx eas-cli build --platform android --profile school-17-production --clear-cache
```

These are native binary changes; an OTA update or Expo Go session cannot verify
R8 shrinking. The existing `development` profile does not test release shrinking.

## Clean, prebuild, and test locally

Use Node compatible with SDK 54 (20.19.4 or newer), JDK 17, and an Android SDK.
Run these commands from `SchoolIMS-Frontend`. With dependencies already installed,
skip `npm ci`; otherwise install from the lockfile first.

```bash
npm ci
npx expo prebuild --clean --platform android --no-install --skip-dependency-update react,react-native
```

`--clean` replaces the generated Android directory. Back up any manual native
changes first; durable changes should live in config plugins.
Set `JAVA_HOME` to your JDK 17 and `ANDROID_HOME` to your Android SDK. This machine
currently has a working cached JDK and SDK at:

```bash
export JAVA_HOME="$HOME/.gradle/jdks/eclipse_adoptium-17-aarch64-os_x.2/jdk-17.0.18+8/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
cd android
./gradlew clean :app:assembleRelease --no-daemon --console=plain
```

Local Gradle builds read `.env` through Expo; they do not inherit `eas.json`
profile variables. Confirm `.env` targets the intended school/API before testing.
This template signs local release APKs with its debug keystore. Use EAS with the
existing production signing credentials for Play uploads. A device already
running a differently signed store app will reject an in-place local install;
use a separate test device/emulator to preserve existing app data.

After connecting a device or starting an emulator:

```bash
adb devices -l
adb install -r app/build/outputs/apk/release/app-release.apk
adb shell am force-stop com.nexsyrussims.geetanjalihighschool
adb shell am start -W -n com.nexsyrussims.geetanjalihighschool/.MainActivity
adb logcat -b crash -d
adb logcat ReactNativeJS:E AndroidRuntime:E '*:S'
```

Use `adb -s SERIAL` when more than one device is connected. Alternatively, from
the frontend root, `npx expo run:android --variant release --device` builds,
installs, and launches a release APK on the selected device.

## Verify the result and exercise native features

The Gradle build should run `:app:minifyReleaseWithR8` and resource shrinking.
From `android/`, check that the mapping file exists and includes renamed classes:

```bash
test -s app/build/outputs/mapping/release/mapping.txt
rg ' -> ' app/build/outputs/mapping/release/mapping.txt | head -20
```

Keep `mapping.txt` with each exact released binary/version. Use it to retrace
crashes and check that Play Console receives the AAB's deobfuscation metadata;
upload the matching mapping file manually if that metadata is absent.

On the release APK, with Metro stopped, test:

- Cold launch, navigation, login, secure storage, and relaunch.
- WatermelonDB reads/writes, offline persistence, and synchronization.
- Staff biometric capability/key/signing flows on a physical supported device.
- Map rendering, location permissions, and background bus tracking.
- Notifications while foregrounded, backgrounded, and closed; custom channel sounds.
- Camera/image picker, document selection/sharing, and animations.

Compilation and a successful launch are separate checks. A passing build does
not establish that every native feature survives optimization. Run Play internal
testing/pre-launch checks against the final AAB as well.

If release logs show `ClassNotFoundException`, `NoSuchMethodException`, or a JNI
lookup failure, retrace the stack and add a keep rule limited to the class/member
used by reflection or JNI. Put durable app-specific rules in the plugin's
`extraProguardRules`, rebuild, and repeat the failing feature test. Check library
consumer rules first. Review R8's `missing_rules.txt` when generated; add only
rules justified by the actual dependency and failure.

R8 shrinks and optimizes Java/Kotlin DEX code. It does not obfuscate the Hermes
JavaScript bundle, resolve JavaScript memory leaks, or establish that a broader
memory warning is fixed. Compare the new binary's Play optimization report.

## If switching to a bare workflow

For this SDK's generated Gradle template, `android/app/build.gradle` already reads
the minification/resource properties. Set these in `android/gradle.properties`:

```properties
android.enableMinifyInReleaseBuilds=true
android.enableShrinkResourcesInReleaseBuilds=true
```

In `android/app/build.gradle`, retain the variable near the top and wire it into
the release build type:

```groovy
def enableMinifyInReleaseBuilds = (findProperty('android.enableMinifyInReleaseBuilds') ?: false).toBoolean()

android {
    buildTypes {
        release {
            minifyEnabled enableMinifyInReleaseBuilds
            shrinkResources (findProperty('android.enableShrinkResourcesInReleaseBuilds') ?: 'false').toBoolean()
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
            // Retain your existing release signing configuration.
        }
    }
}
```

Older templates call this variable `enableProguardInReleaseBuilds`. For one of
those templates, set its definition to `true` (or the matching
`android.enableProguardInReleaseBuilds=true` property if its definition reads
that property) and retain `minifyEnabled enableProguardInReleaseBuilds` in the
release block. Do not introduce the old property into this SDK 54 template.

Retain existing dependency/template rules in `android/app/proguard-rules.pro` and
add `-keepattributes SourceFile,LineNumberTable` for retraceable source locations.
Keep the generated sound XML file in `res/raw/` as well. In a true bare project,
maintain these native files directly and use Gradle clean/build commands;
running `expo prebuild --clean` would replace manually maintained native files.

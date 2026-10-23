import type { ConfigContext, ExpoConfig } from 'expo/config';
import {
  type AndroidManifest,
  type ConfigPlugin,
  withAndroidManifest,
  withAppBuildGradle,
} from 'expo/config-plugins';

type ManifestUsesPermission = NonNullable<AndroidManifest['manifest']['uses-permission']>[number];

const READ_EXTERNAL_STORAGE = 'android.permission.READ_EXTERNAL_STORAGE';

/**
 * READ_EXTERNAL_STORAGE is only needed below Android 13 (API 33), where READ_MEDIA_AUDIO
 * replaces it. `android.permissions` cannot express maxSdkVersion, so set it here.
 */
const withLegacyStoragePermission: ConfigPlugin = (config) =>
  withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    const permissions = (manifest['uses-permission'] ?? []).filter(
      (p) => p.$['android:name'] !== READ_EXTERNAL_STORAGE,
    );
    const attributes: ManifestUsesPermission['$'] & { 'android:maxSdkVersion': string } = {
      'android:name': READ_EXTERNAL_STORAGE,
      'android:maxSdkVersion': '32',
    };
    permissions.push({ $: attributes });
    manifest['uses-permission'] = permissions;
    return mod;
  });

const WINDOWS_CMAKE_VERSION = '3.31.6';

/**
 * The SDK's default CMake 3.22.1 ships ninja 1.10, which cannot stat object paths longer than
 * MAX_PATH on Windows. CMake 3.31.6 ships ninja 1.12 with long-path support. Other hosts keep
 * the default.
 */
const withWindowsCmake: ConfigPlugin = (config) =>
  process.platform !== 'win32'
    ? config
    : withAppBuildGradle(config, (mod) => {
        if (!mod.modResults.contents.includes(`version "${WINDOWS_CMAKE_VERSION}"`)) {
          mod.modResults.contents += `
android {
    externalNativeBuild {
        cmake {
            version "${WINDOWS_CMAKE_VERSION}"
        }
    }
}
`;
        }
        return mod;
      });

export default ({ config }: ConfigContext): ExpoConfig =>
  withWindowsCmake(
    withLegacyStoragePermission({
      ...config,
      name: 'Aulos',
      slug: 'aulos',
      version: '0.1.0',
      orientation: 'portrait',
      icon: './assets/images/icon.png',
      scheme: 'aulos',
      userInterfaceStyle: 'automatic',
      platforms: ['android'],
      android: {
        package: 'com.anywecon.aulos',
        versionCode: 1,
        adaptiveIcon: {
          backgroundColor: '#E6F4FE',
          foregroundImage: './assets/images/android-icon-foreground.png',
          backgroundImage: './assets/images/android-icon-background.png',
          monochromeImage: './assets/images/android-icon-monochrome.png',
        },
        predictiveBackGestureEnabled: false,
        permissions: ['android.permission.READ_MEDIA_AUDIO'],
        blockedPermissions: [
          'android.permission.INTERNET',
          'android.permission.RECORD_AUDIO',
          'android.permission.MODIFY_AUDIO_SETTINGS',
          'android.permission.SYSTEM_ALERT_WINDOW',
          'android.permission.WRITE_EXTERNAL_STORAGE',
          'android.permission.VIBRATE',
        ],
      },
      plugins: [
        'expo-router',
        [
          'expo-splash-screen',
          {
            backgroundColor: '#208AEF',
            image: './assets/images/splash-icon.png',
            imageWidth: 76,
          },
        ],
        ['expo-sqlite', { enableFTS: true }],
        [
          'expo-audio',
          {
            enableBackgroundPlayback: true,
            enableBackgroundRecording: false,
            microphonePermission: false,
            recordAudioAndroid: false,
          },
        ],
      ],
      experiments: {
        typedRoutes: true,
        reactCompiler: true,
      },
    }),
  );

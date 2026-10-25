import type { ConfigContext, ExpoConfig } from 'expo/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  AndroidConfig,
  type AndroidManifest,
  type ConfigPlugin,
  withAndroidManifest,
  withAndroidStyles,
  withAppBuildGradle,
  withDangerousMod,
  withFinalizedMod,
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

/** Repository named in the User-Agent of every request (src/net/client.ts). */
const REPOSITORY_URL = 'https://github.com/Fiouri/aulos';

const NETWORK_SECURITY_CONFIG = 'network_security_config';

/**
 * Cleartext is permitted at the platform level because Nuclear Jam on the PC only speaks HTTP
 * and Android's network security config cannot whitelist IP ranges (LAN, Tailscale 100.64/10).
 * The control is in app code: every request goes through assertRequestAllowed (src/net/guard.ts),
 * which allows HTTP only to private-network hosts and HTTPS everywhere else.
 */
const NETWORK_SECURITY = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="true" />
</network-security-config>
`;

const withNetworkSecurityConfig: ConfigPlugin = (config) =>
  withAndroidManifest(
    withDangerousMod(config, [
      'android',
      (mod) => {
        const dir = join(mod.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, `${NETWORK_SECURITY_CONFIG}.xml`), NETWORK_SECURITY);
        return mod;
      },
    ]),
    (mod) => {
      const application = mod.modResults.manifest.application?.[0];
      if (application) {
        application.$['android:networkSecurityConfig'] = `@xml/${NETWORK_SECURITY_CONFIG}`;
        application.$['android:usesCleartextTraffic'] = 'true';
      }
      return mod;
    },
  );

const SHARING_GENERATED_TAG = 'expo-sharing-intent-filters';

/**
 * expo-sharing marks its intent filters with a bare `expo-sharing-intent-filters` attribute
 * (lint MissingPrefix) and always adds a SEND_MULTIPLE filter, which has no MIME type here and
 * so matches nothing. expo-sharing removes its old filters by that marker on every manifest
 * pass, so the cleanup edits the written manifest once all mods have run.
 */
const withCleanShareIntentFilters: ConfigPlugin = (config) =>
  withFinalizedMod(config, [
    'android',
    async (mod) => {
      const path = await AndroidConfig.Paths.getAndroidManifestAsync(mod.modRequest.projectRoot);
      const manifest = await AndroidConfig.Manifest.readAndroidManifestAsync(path);
      const activity = AndroidConfig.Manifest.getMainActivityOrThrow(manifest);
      activity['intent-filter'] = (activity['intent-filter'] ?? [])
        .filter((filter) => {
          const attributes: Record<string, string | undefined> = filter.$ ?? {};
          return attributes[SHARING_GENERATED_TAG] !== 'true' || (filter.data?.length ?? 0) > 0;
        })
        .map((filter) => {
          const attributes: Record<string, string | undefined> = { ...filter.$ };
          delete attributes[SHARING_GENERATED_TAG];
          return { ...filter, $: attributes };
        });
      await AndroidConfig.Manifest.writeAndroidManifestAsync(path, manifest);
      return mod;
    },
  ]);

const SPLASH_BEHAVIOR = 'android:windowSplashScreenBehavior';

/**
 * expo-splash-screen writes android:windowSplashScreenBehavior (API 33+) into values/styles.xml.
 * Mark it tools:targetApi="33" so lint knows older releases simply ignore it.
 */
const withSplashBehaviorTargetApi: ConfigPlugin = (config) =>
  withAndroidStyles(config, (mod) => {
    const resources = mod.modResults.resources;
    resources.$ = { ...resources.$, 'xmlns:tools': 'http://schemas.android.com/tools' };
    for (const style of resources.style ?? []) {
      for (const item of style.item) {
        if (item.$.name === SPLASH_BEHAVIOR) item.$['tools:targetApi'] = '33';
      }
    }
    return mod;
  });

/**
 * R8 keep rules beyond the consumer rules that Expo modules and React Native libraries ship.
 * The local media-store module is created by Expo's module registry, and its function results
 * are read back by name, so keep it whole.
 */
const PROGUARD_RULES = `
-keep class com.anywecon.aulos.mediastore.** { *; }
`;

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
  withCleanShareIntentFilters(
    withNetworkSecurityConfig(
      withWindowsCmake(
        withSplashBehaviorTargetApi(
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
              // POST_NOTIFICATIONS: expo-audio's media playback service posts the player
              // notification on Android 13+. INTERNET: Internet Archive search, streaming and
              // downloads over HTTPS (M2).
              permissions: [
                'android.permission.READ_MEDIA_AUDIO',
                'android.permission.POST_NOTIFICATIONS',
                'android.permission.INTERNET',
              ],
              // ACCESS_WIFI_STATE comes with expo-network but is not needed: the connection type
              // is read from ConnectivityManager (ACCESS_NETWORK_STATE).
              blockedPermissions: [
                'android.permission.ACCESS_WIFI_STATE',
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
              [
                'expo-build-properties',
                {
                  android: {
                    enableMinifyInReleaseBuilds: true,
                    enableShrinkResourcesInReleaseBuilds: true,
                    extraProguardRules: PROGUARD_RULES,
                  },
                },
              ],
              ['expo-sqlite', { enableFTS: true }],
              // Receives playlist files from the share sheet (Nuclear exports, Aulos exports).
              [
                'expo-sharing',
                { android: { enabled: true, singleShareMimeTypes: ['application/json'] } },
              ],
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
            extra: {
              ...config.extra,
              repositoryUrl: REPOSITORY_URL,
            },
          }),
        ),
      ),
    ),
  );

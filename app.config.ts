import type { ConfigContext, ExpoConfig } from 'expo/config';
import { mkdirSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
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
  withGradleProperties,
} from 'expo/config-plugins';

/** Version name of this release; see RELEASING.md for the version scheme. */
const VERSION = '1.0.0-rc.1';

/**
 * Base versionCode of this release (RELEASING.md): it grows by 10 with every published build and
 * each ABI APK adds its digit below; the universal APK keeps the base.
 */
const VERSION_CODE_BASE = 10000;

/** ABIs that get their own APK, with the digit added to the base versionCode. */
const ABI_DIGITS = { 'armeabi-v7a': 1, 'arm64-v8a': 2, x86_64: 3 } as const;

/** Background of the adaptive launcher icon; the mark itself is drawn by scripts/render-icons.ts. */
const ICON_BACKGROUND = '#1F5FD6';

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

/**
 * One APK per ABI plus a universal APK. Each ABI APK's versionCode is the base plus its digit
 * (ABI_DIGITS), so an ABI APK always upgrades the universal one. Native code is only built for
 * these ABIs (no 32-bit x86).
 */
const withAbiSplits: ConfigPlugin = (config) => {
  const abis = Object.keys(ABI_DIGITS);
  const digits = Object.entries(ABI_DIGITS)
    .map(([abi, digit]) => `'${abi}': ${digit}`)
    .join(', ');
  const withArchitectures = withGradleProperties(config, (mod) => {
    mod.modResults = mod.modResults.filter(
      (item) => item.type !== 'property' || item.key !== 'reactNativeArchitectures',
    );
    mod.modResults.push({
      type: 'property',
      key: 'reactNativeArchitectures',
      value: abis.join(','),
    });
    return mod;
  });
  return withAppBuildGradle(withArchitectures, (mod) => {
    if (mod.modResults.contents.includes('aulosAbiDigits')) return mod;
    mod.modResults.contents += `
// ABI splits (app.config.ts withAbiSplits).
def aulosAbiDigits = [${digits}]
android {
    splits {
        abi {
            enable true
            reset()
            include ${abis.map((abi) => `'${abi}'`).join(', ')}
            universalApk true
        }
    }
}
androidComponents {
    onVariants(selector().all()) { variant ->
        variant.outputs.each { output ->
            def abi = output.filters.find { it.filterType.name() == 'ABI' }?.identifier
            def digit = aulosAbiDigits[abi]
            if (digit != null) {
                output.versionCode.set(output.versionCode.get() + digit)
            }
        }
    }
}
`;
    return mod;
  });
};

const SIGNING_PROPERTIES = [
  'AULOS_STORE_FILE',
  'AULOS_STORE_PASSWORD',
  'AULOS_KEY_ALIAS',
  'AULOS_KEY_PASSWORD',
] as const;

/**
 * Release signing from the four AULOS_* properties in ~/.gradle/gradle.properties (RELEASING.md).
 * Without them a release build stops with a message naming the missing ones; it never falls back
 * to the debug keystore. CI passes -Paulos.unsignedRelease=true to build unsigned APKs.
 */
const withReleaseSigning: ConfigPlugin = (config) =>
  withAppBuildGradle(config, (mod) => {
    let contents = mod.modResults.contents;
    if (contents.includes('aulosMissingSigning')) return mod;

    const releaseSigning =
      /(buildTypes\s*\{[\s\S]*?release\s*\{\s*)(?:\/\/[^\n]*\n\s*)*signingConfig signingConfigs\.debug/;
    const signingConfigs = /signingConfigs\s*\{/;
    const androidBlock = /^android\s*\{/m;
    if (![releaseSigning, signingConfigs, androidBlock].every((anchor) => anchor.test(contents))) {
      throw new Error('withReleaseSigning: app/build.gradle no longer has the expected layout.');
    }

    contents = contents.replace(
      androidBlock,
      `// Release signing (app.config.ts withReleaseSigning).
def aulosSigningProperties = [${SIGNING_PROPERTIES.map((p) => `'${p}'`).join(', ')}]
def aulosUnsignedRelease = (findProperty('aulos.unsignedRelease') ?: 'false').toBoolean()
def aulosMissingSigning = aulosSigningProperties.findAll { !findProperty(it) }

android {`,
    );
    contents = contents.replace(
      signingConfigs,
      `signingConfigs {
        release {
            if (aulosMissingSigning.isEmpty()) {
                storeFile file(findProperty('AULOS_STORE_FILE'))
                storePassword findProperty('AULOS_STORE_PASSWORD')
                keyAlias findProperty('AULOS_KEY_ALIAS')
                keyPassword findProperty('AULOS_KEY_PASSWORD')
            }
        }`,
    );
    contents = contents.replace(
      releaseSigning,
      '$1signingConfig aulosUnsignedRelease ? null : signingConfigs.release',
    );
    contents += `
def aulosCheckReleaseSigning = tasks.register('aulosCheckReleaseSigning') {
    def missing = aulosMissingSigning
    doLast {
        if (!missing.isEmpty()) {
            throw new GradleException("Release signing is not configured: " +
                "\${missing.join(', ')} missing from ~/.gradle/gradle.properties. " +
                "See RELEASING.md, or pass -Paulos.unsignedRelease=true for an unsigned build.")
        }
    }
}
tasks.matching { it.name == 'validateSigningRelease' }.configureEach {
    dependsOn aulosCheckReleaseSigning
}
`;
    mod.modResults.contents = contents;
    return mod;
  });

/**
 * Expo writes the launcher icons as PNG data under .webp names (lint IconExtension). Resource
 * names ignore the extension, so the files are renamed to .png once every mod has run.
 */
const withPngLauncherIcons: ConfigPlugin = (config) =>
  withFinalizedMod(config, [
    'android',
    (mod) => {
      const res = join(mod.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res');
      for (const dir of readdirSync(res).filter((name) => name.startsWith('mipmap-'))) {
        for (const file of readdirSync(join(res, dir))) {
          if (file.startsWith('ic_launcher') && file.endsWith('.webp')) {
            renameSync(join(res, dir, file), join(res, dir, file.replace(/\.webp$/, '.png')));
          }
        }
      }
      return mod;
    },
  ]);

export default ({ config }: ConfigContext): ExpoConfig =>
  withPngLauncherIcons(
    withReleaseSigning(
      withAbiSplits(
        withCleanShareIntentFilters(
          withNetworkSecurityConfig(
            withWindowsCmake(
              withSplashBehaviorTargetApi(
                withLegacyStoragePermission({
                  ...config,
                  name: 'Aulos',
                  slug: 'aulos',
                  version: VERSION,
                  orientation: 'portrait',
                  icon: './assets/images/icon.png',
                  scheme: 'aulos',
                  userInterfaceStyle: 'automatic',
                  platforms: ['android'],
                  android: {
                    package: 'com.anywecon.aulos',
                    versionCode: VERSION_CODE_BASE,
                    adaptiveIcon: {
                      backgroundColor: ICON_BACKGROUND,
                      foregroundImage: './assets/images/android-icon-foreground.png',
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
                        backgroundColor: '#FFFFFF',
                        image: './assets/images/splash-icon.png',
                        imageWidth: 160,
                        dark: {
                          backgroundColor: '#0E1012',
                          image: './assets/images/splash-icon-dark.png',
                        },
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
        ),
      ),
    ),
  );

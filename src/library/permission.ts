import { PermissionsAndroid, Platform, type Permission } from 'react-native';

export type AudioPermission = 'granted' | 'denied' | 'blocked';

/** READ_MEDIA_AUDIO from Android 13 (API 33); READ_EXTERNAL_STORAGE before that. */
export function audioPermissionFor(apiLevel: number): Permission {
  return apiLevel >= 33
    ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_AUDIO
    : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;
}

function currentApiLevel(): number {
  return typeof Platform.Version === 'number' ? Platform.Version : 0;
}

export async function checkAudioPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  return PermissionsAndroid.check(audioPermissionFor(currentApiLevel()));
}

export async function requestAudioPermission(): Promise<AudioPermission> {
  if (Platform.OS !== 'android') return 'denied';
  const result = await PermissionsAndroid.request(audioPermissionFor(currentApiLevel()));
  if (result === PermissionsAndroid.RESULTS.GRANTED) return 'granted';
  if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) return 'blocked';
  return 'denied';
}

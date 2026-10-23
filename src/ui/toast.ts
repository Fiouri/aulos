import { ToastAndroid } from 'react-native';

/** Short, non-blocking notice at the bottom of the screen. */
export function showToast(message: string): void {
  ToastAndroid.show(message, ToastAndroid.SHORT);
}

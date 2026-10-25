/**
 * What the native player may open: files on the device (MediaStore content:// and downloads in
 * app storage) and HTTPS streams. Provider streams over plain HTTP are refused.
 */
export function isPlayableSource(uri: string): boolean {
  return /^(content|file|https):\/\//i.test(uri);
}

/** The file is larger than what the storage limit still allows; nothing was downloaded. */
export class StorageLimitError extends Error {
  override name = 'StorageLimitError';
  constructor(
    readonly bytesNeeded: number,
    readonly bytesAllowed: number,
  ) {
    super('Storage limit reached');
  }
}

/** The downloaded file does not match the MD5 the provider published; it was deleted. */
export class IntegrityError extends Error {
  override name = 'IntegrityError';
  constructor() {
    super('Checksum mismatch');
  }
}

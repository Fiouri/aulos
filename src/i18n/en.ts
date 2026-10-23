export const en = {
  app: {
    name: 'Aulos',
    startupFailed: 'Aulos could not open its database.',
  },
  tabs: {
    library: 'Library',
    settings: 'Settings',
  },
  library: {
    title: 'Library',
    tracks_one: 'track',
    tracks_other: 'tracks',
    scan: 'Scan library',
    scanning: 'Scanning…',
    lastScan: 'Last scan: {{date}}',
    neverScanned: 'Not scanned yet',
    lastResult: '{{added}} added · {{updated}} updated · {{removed}} removed',
    scanDuration: 'Took {{seconds}} s',
    empty: 'No music found. Copy audio files to this phone, then scan again.',
    permissionNeeded: 'Aulos needs access to your audio files to build your library.',
    permissionDenied: 'Audio access was denied. Grant it to scan your library.',
    permissionBlocked:
      'Audio access is turned off for Aulos. Enable “Music and audio” in the app settings.',
    grantAccess: 'Grant access',
    openSettings: 'Open settings',
    scanFailed: 'Scan failed: {{message}}',
  },
  settings: {
    title: 'Settings',
    theme: 'Theme',
    themeSystem: 'System',
    themeLight: 'Light',
    themeDark: 'Dark',
    about: 'About',
    version: 'Version',
    licence: 'Licence',
    licenceId: 'GPL-3.0-or-later',
    licenceText:
      'Aulos is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License, version 3 or any later version.',
  },
} as const;

export type Resources = typeof en;

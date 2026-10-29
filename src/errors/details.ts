/** What the error screen copies: the error, where it happened and which build ran it. */
export interface ErrorDetailsInput {
  error: unknown;
  appVersion: string;
  /** Android release name, e.g. "14". */
  androidRelease: string;
  apiLevel: number;
  /** React's component stack, when the error came from rendering. */
  componentStack?: string | null;
  time: Date;
}

const MAX_STACK_LINES = 40;
const MAX_MESSAGE_LENGTH = 500;

/**
 * Parts of a message or stack that could identify the user or their files and network: URIs and
 * URLs (track paths, PC addresses), absolute device paths, IP addresses and e-mail addresses.
 * Bundle positions such as "index.android.bundle:1:2345" stay, they are what makes a stack useful.
 */
const REDACTIONS: readonly [RegExp, string][] = [
  [/\b(?:content|file):\/\/\S+/gi, '<uri>'],
  [/\bhttps?:\/\/[^\s/]+/gi, '<url>'],
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '<email>'],
  [/(?:\/(?:storage|sdcard|data|mnt)\/)[^\s:)]+/g, '<path>'],
  [/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/g, '<ip>'],
  // IPv6: four or more groups, or a "::" abbreviation (times like 12:34:56 have only three).
  [/\b(?:[0-9a-f]{1,4}:){3,7}[0-9a-f]{1,4}\b/gi, '<ip>'],
  [/(?:\b[0-9a-f]{1,4})?(?::[0-9a-f]{1,4})*::(?:[0-9a-f]{1,4}\b)?(?::[0-9a-f]{1,4}\b)*/gi, '<ip>'],
];

export function redact(text: string): string {
  return REDACTIONS.reduce(
    (out, [pattern, replacement]) => out.replace(pattern, replacement),
    text,
  );
}

function describe(error: unknown): { title: string; stack: string | null } {
  if (error instanceof Error) {
    const message = error.message.slice(0, MAX_MESSAGE_LENGTH);
    return {
      title: message ? `${error.name}: ${message}` : error.name,
      stack: error.stack ?? null,
    };
  }
  return {
    title: `Non-error value thrown: ${String(error).slice(0, MAX_MESSAGE_LENGTH)}`,
    stack: null,
  };
}

function trimLines(text: string): string {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length <= MAX_STACK_LINES) return lines.join('\n');
  const hidden = lines.length - MAX_STACK_LINES;
  return [...lines.slice(0, MAX_STACK_LINES), `… ${hidden} more lines`].join('\n');
}

/** Plain-text report for "Copy error details": no personal data, safe to paste in an issue. */
export function formatErrorDetails(input: ErrorDetailsInput): string {
  const { title, stack } = describe(input.error);
  const lines = [
    'Aulos error report',
    `App version: ${input.appVersion}`,
    `Android: ${input.androidRelease} (API ${input.apiLevel})`,
    `Time: ${input.time.toISOString()}`,
    '',
    redact(title),
  ];
  // Hermes stacks repeat the message on their first line.
  const frames = stack
    ?.split('\n')
    .filter((line) => /^\s*at /.test(line))
    .join('\n');
  if (frames) lines.push('', 'Stack:', redact(trimLines(frames)));
  if (input.componentStack?.trim()) {
    lines.push('', 'Component stack:', redact(trimLines(input.componentStack)));
  }
  return lines.join('\n');
}

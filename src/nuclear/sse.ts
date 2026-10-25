import { assertRequestAllowed } from '@/net/guard';

export interface SseEvent {
  /** `event:` field, or "message" when the frame has none. */
  type: string;
  /** `data:` lines joined with "\n". */
  data: string;
}

/**
 * Incremental Server-Sent Events parser (WHATWG event-stream format): lines end in LF, CRLF or
 * CR; `event:` and `data:` fields (several data lines join with LF); lines starting with ':'
 * are comments; a blank line dispatches the frame. Chunks may split anywhere.
 */
export function createSseParser(onEvent: (event: SseEvent) => void) {
  let buffer = '';
  let type = '';
  let data: string[] = [];

  const field = (line: string) => {
    if (line === '') {
      if (data.length > 0) onEvent({ type: type || 'message', data: data.join('\n') });
      type = '';
      data = [];
      return;
    }
    if (line.startsWith(':')) return;
    const colon = line.indexOf(':');
    const name = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (name === 'event') type = value;
    else if (name === 'data') data.push(value);
  };

  return {
    push(chunk: string) {
      buffer += chunk;
      for (;;) {
        const end = buffer.search(/\r\n|\r|\n/);
        // A trailing CR may be the first half of a CRLF split across chunks.
        if (end === -1 || (end === buffer.length - 1 && buffer[end] === '\r')) return;
        const line = buffer.slice(0, end);
        buffer = buffer.slice(buffer.startsWith('\r\n', end) ? end + 2 : end + 1);
        field(line);
      }
    },
    reset() {
      buffer = '';
      type = '';
      data = [];
    },
  };
}

/** The part of XMLHttpRequest the stream uses; tests pass a fake. */
export interface XhrLike {
  readyState: number;
  status: number;
  responseText: string;
  onprogress: (() => void) | null;
  onreadystatechange: (() => void) | null;
  onerror: (() => void) | null;
  open(method: string, url: string): void;
  setRequestHeader(name: string, value: string): void;
  send(): void;
  abort(): void;
}

export type SseState = 'connecting' | 'open' | 'reconnecting' | 'stopped';

export interface SseDeps {
  createXhr: () => XhrLike;
  setTimeout: (run: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
  /** Foreground state; the stream only runs while the app is active. */
  appState: {
    current: () => string;
    subscribe: (listener: (state: string) => void) => () => void;
  };
}

/** Waits between reconnect attempts: 1, 2, 5, 10, then 30 s. */
export const RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10_000, 30_000];
/** No byte (event or keep-alive comment) for this long means the connection is dead. */
export const STALE_AFTER_MS = 45_000;
/** responseText keeps every byte; past this size the stream is reopened to free it. */
export const MAX_BUFFERED_CHARS = 2_000_000;

const DONE = 4;

export interface SseHandlers {
  onEvent: (event: SseEvent) => void;
  /** The stream answered 200: events flow from here on (reload state now). */
  onOpen: () => void;
  onState: (state: SseState) => void;
}

/**
 * Event stream over XMLHttpRequest incremental responseText (React Native has no EventSource).
 * Reconnects with backoff, treats 45 s of silence as a dead connection, and closes while the
 * app is in the background, reopening when it returns.
 */
export class SseConnection {
  readonly #url: string;
  readonly #handlers: SseHandlers;
  readonly #deps: SseDeps;
  readonly #parser: ReturnType<typeof createSseParser>;
  #xhr: XhrLike | null = null;
  #offset = 0;
  #attempt = 0;
  #retryTimer: unknown = null;
  #staleTimer: unknown = null;
  #running = false;
  #opened = false;
  #unsubscribeAppState: (() => void) | null = null;
  #state: SseState = 'stopped';

  constructor(url: string, handlers: SseHandlers, deps: SseDeps) {
    assertRequestAllowed(url);
    this.#url = url;
    this.#handlers = handlers;
    this.#deps = deps;
    this.#parser = createSseParser(handlers.onEvent);
  }

  get state(): SseState {
    return this.#state;
  }

  start(): void {
    if (this.#running) return;
    this.#running = true;
    this.#attempt = 0;
    this.#unsubscribeAppState = this.#deps.appState.subscribe((state) => {
      if (!this.#running) return;
      if (state === 'active') {
        if (!this.#xhr) {
          this.#attempt = 0;
          this.#connect('connecting');
        }
      } else {
        this.#close();
        this.#setState('reconnecting');
      }
    });
    if (this.#deps.appState.current() === 'active') this.#connect('connecting');
    else this.#setState('reconnecting');
  }

  stop(): void {
    this.#running = false;
    this.#unsubscribeAppState?.();
    this.#unsubscribeAppState = null;
    this.#close();
    this.#setState('stopped');
  }

  #setState(state: SseState) {
    if (state === this.#state) return;
    this.#state = state;
    this.#handlers.onState(state);
  }

  #connect(state: 'connecting' | 'reconnecting') {
    this.#close();
    this.#setState(state);
    this.#parser.reset();
    this.#offset = 0;
    this.#opened = false;
    const xhr = this.#deps.createXhr();
    this.#xhr = xhr;
    const read = () => {
      if (this.#xhr !== xhr) return;
      if (xhr.readyState >= 3 && xhr.status === 200) {
        if (!this.#opened) {
          this.#opened = true;
          this.#attempt = 0;
          this.#setState('open');
          this.#handlers.onOpen();
        }
        const text = xhr.responseText;
        if (text.length > this.#offset) {
          this.#parser.push(text.slice(this.#offset));
          this.#offset = text.length;
          this.#armStale();
        }
        if (this.#offset > MAX_BUFFERED_CHARS) {
          this.#connect('reconnecting');
          return;
        }
      }
      if (xhr.readyState === DONE) this.#retry();
    };
    xhr.onprogress = read;
    xhr.onreadystatechange = read;
    xhr.onerror = () => {
      if (this.#xhr === xhr) this.#retry();
    };
    xhr.open('GET', this.#url);
    xhr.setRequestHeader('Accept', 'text/event-stream');
    xhr.setRequestHeader('Cache-Control', 'no-cache');
    xhr.send();
    this.#armStale();
  }

  #armStale() {
    if (this.#staleTimer !== null) this.#deps.clearTimeout(this.#staleTimer);
    this.#staleTimer = this.#deps.setTimeout(() => {
      this.#staleTimer = null;
      this.#retry();
    }, STALE_AFTER_MS);
  }

  #retry() {
    this.#close();
    if (!this.#running) return;
    this.#setState('reconnecting');
    const delay =
      RECONNECT_DELAYS_MS[Math.min(this.#attempt, RECONNECT_DELAYS_MS.length - 1)] ?? 30_000;
    this.#attempt += 1;
    this.#retryTimer = this.#deps.setTimeout(() => {
      this.#retryTimer = null;
      this.#connect('reconnecting');
    }, delay);
  }

  #close() {
    if (this.#retryTimer !== null) this.#deps.clearTimeout(this.#retryTimer);
    if (this.#staleTimer !== null) this.#deps.clearTimeout(this.#staleTimer);
    this.#retryTimer = null;
    this.#staleTimer = null;
    const xhr = this.#xhr;
    this.#xhr = null;
    if (xhr) {
      xhr.onprogress = null;
      xhr.onreadystatechange = null;
      xhr.onerror = null;
      xhr.abort();
    }
  }
}

/** The platform XMLHttpRequest behind the XhrLike interface. */
export function platformXhr(): XhrLike {
  const xhr = new XMLHttpRequest();
  let onprogress: (() => void) | null = null;
  let onreadystatechange: (() => void) | null = null;
  let onerror: (() => void) | null = null;
  return {
    get readyState() {
      return xhr.readyState;
    },
    get status() {
      return xhr.status;
    },
    get responseText() {
      return xhr.responseText;
    },
    get onprogress() {
      return onprogress;
    },
    set onprogress(handler) {
      onprogress = handler;
      xhr.onprogress = handler ? () => handler() : null;
    },
    get onreadystatechange() {
      return onreadystatechange;
    },
    set onreadystatechange(handler) {
      onreadystatechange = handler;
      xhr.onreadystatechange = handler ? () => handler() : null;
    },
    get onerror() {
      return onerror;
    },
    set onerror(handler) {
      onerror = handler;
      xhr.onerror = handler ? () => handler() : null;
    },
    open: (method, url) => xhr.open(method, url),
    setRequestHeader: (name, value) => xhr.setRequestHeader(name, value),
    send: () => xhr.send(),
    abort: () => xhr.abort(),
  };
}

import {
  createSseParser,
  MAX_BUFFERED_CHARS,
  SseConnection,
  STALE_AFTER_MS,
  type SseEvent,
  type SseState,
  type XhrLike,
} from '../sse';

describe('createSseParser', () => {
  const parse = (...chunks: string[]) => {
    const events: SseEvent[] = [];
    const parser = createSseParser((e) => events.push(e));
    chunks.forEach((c) => parser.push(c));
    return events;
  };

  it('parses named events and the default message type', () => {
    expect(parse('event: queue\ndata: {"a":1}\n\ndata: plain\n\n')).toEqual([
      { type: 'queue', data: '{"a":1}' },
      { type: 'message', data: 'plain' },
    ]);
  });

  it('joins multi-line data and skips comments', () => {
    expect(parse(': connected\n\n:\n\nevent: playback\ndata: line 1\ndata:line 2\n\n')).toEqual([
      { type: 'playback', data: 'line 1\nline 2' },
    ]);
  });

  it('handles CRLF, CR and chunks split anywhere, including inside CRLF', () => {
    expect(parse('event: queue\r', '\ndata: {"x"', ':2}\r\n\r', '\n')).toEqual([
      { type: 'queue', data: '{"x":2}' },
    ]);
    // A trailing CR waits for the next chunk: it may be the first half of a CRLF.
    expect(parse('data: a\rdata: b\r\r')).toEqual([]);
    expect(parse('data: a\rdata: b\r\r', ':')).toEqual([{ type: 'message', data: 'a\nb' }]);
  });

  it('ignores frames without data and unknown fields', () => {
    expect(parse('event: settings\n\nid: 7\nretry: 100\ndata: x\n\n')).toEqual([
      { type: 'message', data: 'x' },
    ]);
  });

  it('does not dispatch an unfinished frame', () => {
    expect(parse('event: queue\ndata: {"a":1}\n')).toEqual([]);
  });
});

class FakeXhr implements XhrLike {
  readyState = 0;
  status = 0;
  responseText = '';
  onprogress: (() => void) | null = null;
  onreadystatechange: (() => void) | null = null;
  onerror: (() => void) | null = null;
  url = '';
  headers: Record<string, string> = {};
  aborted = false;
  open(_method: string, url: string) {
    this.url = url;
    this.readyState = 1;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send() {}
  abort() {
    this.aborted = true;
  }
  receive(text: string) {
    this.readyState = 3;
    this.status = 200;
    this.responseText += text;
    this.onprogress?.();
  }
  end() {
    this.readyState = 4;
    this.onreadystatechange?.();
  }
  fail() {
    this.readyState = 4;
    this.status = 0;
    this.onerror?.();
  }
}

describe('SseConnection', () => {
  let xhrs: FakeXhr[];
  let timers: { run: () => void; at: number; id: number }[];
  let now: number;
  let nextId: number;
  let appState: string;
  let appListener: ((state: string) => void) | null;
  let events: SseEvent[];
  let states: SseState[];
  let opens: number;

  const advance = (ms: number) => {
    now += ms;
    for (;;) {
      const due = timers.filter((t) => t.at <= now).sort((a, b) => a.at - b.at)[0];
      if (!due) return;
      timers = timers.filter((t) => t !== due);
      due.run();
    }
  };
  const last = () => {
    const xhr = xhrs[xhrs.length - 1];
    if (!xhr) throw new Error('no request');
    return xhr;
  };

  const connect = () => {
    const connection = new SseConnection(
      'http://192.168.1.5:4120/api/events',
      {
        onEvent: (e) => events.push(e),
        onOpen: () => {
          opens += 1;
        },
        onState: (s) => states.push(s),
      },
      {
        createXhr: () => {
          const xhr = new FakeXhr();
          xhrs.push(xhr);
          return xhr;
        },
        setTimeout: (run, ms) => {
          nextId += 1;
          timers.push({ run, at: now + ms, id: nextId });
          return nextId;
        },
        clearTimeout: (id) => {
          timers = timers.filter((t) => t.id !== id);
        },
        appState: {
          current: () => appState,
          subscribe: (listener) => {
            appListener = listener;
            return () => {
              appListener = null;
            };
          },
        },
      },
    );
    connection.start();
    return connection;
  };

  beforeEach(() => {
    xhrs = [];
    timers = [];
    now = 0;
    nextId = 0;
    appState = 'active';
    appListener = null;
    events = [];
    states = [];
    opens = 0;
  });

  it('opens the stream and delivers events across chunks', () => {
    connect();
    expect(last().url).toBe('http://192.168.1.5:4120/api/events');
    expect(last().headers.Accept).toBe('text/event-stream');
    last().receive(': connected\n\nevent: playback\ndata: {"status":"pla');
    last().receive('ying","seek":1,"duration":2}\n\n');
    expect(opens).toBe(1);
    expect(states).toEqual(['connecting', 'open']);
    expect(events).toEqual([
      { type: 'playback', data: '{"status":"playing","seek":1,"duration":2}' },
    ]);
  });

  it('reconnects with 1, 2, 5, 10, 30, 30 s backoff and resets after a success', () => {
    connect();
    const delays: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const before = now;
      const count = xhrs.length;
      last().fail();
      while (xhrs.length === count) advance(100);
      delays.push(now - before);
    }
    expect(delays).toEqual([1000, 2000, 5000, 10_000, 30_000, 30_000]);
    last().receive(': ok\n\n');
    expect(states[states.length - 1]).toBe('open');
    const before = now;
    const count = xhrs.length;
    last().end();
    while (xhrs.length === count) advance(100);
    expect(now - before).toBe(1000);
  });

  it('treats 45 s without bytes as a dead connection; keep-alive comments keep it alive', () => {
    connect();
    last().receive(': connected\n\n');
    advance(STALE_AFTER_MS - 1000);
    last().receive(':\n\n');
    advance(STALE_AFTER_MS - 1000);
    expect(xhrs).toHaveLength(1);
    advance(1000);
    expect(xhrs[0]?.aborted).toBe(true);
    expect(states[states.length - 1]).toBe('reconnecting');
    advance(1000);
    expect(xhrs).toHaveLength(2);
  });

  it('closes in the background and reopens in the foreground', () => {
    connect();
    last().receive(': connected\n\n');
    appState = 'background';
    appListener?.('background');
    expect(xhrs[0]?.aborted).toBe(true);
    advance(60_000);
    expect(xhrs).toHaveLength(1);
    appState = 'active';
    appListener?.('active');
    expect(xhrs).toHaveLength(2);
    last().receive(': connected\n\n');
    expect(opens).toBe(2);
  });

  it('waits for the foreground when started in the background', () => {
    appState = 'background';
    connect();
    expect(xhrs).toHaveLength(0);
    appState = 'active';
    appListener?.('active');
    expect(xhrs).toHaveLength(1);
  });

  it('reopens the stream when the buffered response grows too large', () => {
    connect();
    last().receive(`: ${'x'.repeat(MAX_BUFFERED_CHARS)}\n\n`);
    expect(xhrs).toHaveLength(2);
    expect(xhrs[0]?.aborted).toBe(true);
  });

  it('stops for good', () => {
    const connection = connect();
    connection.stop();
    expect(xhrs[0]?.aborted).toBe(true);
    advance(60_000);
    expect(xhrs).toHaveLength(1);
    expect(connection.state).toBe('stopped');
    expect(appListener).toBeNull();
  });

  it('refuses a stream to a public host over plain HTTP', () => {
    expect(
      () =>
        new SseConnection(
          'http://example.com/api/events',
          { onEvent: () => undefined, onOpen: () => undefined, onState: () => undefined },
          {
            createXhr: () => new FakeXhr(),
            setTimeout: () => 0,
            clearTimeout: () => undefined,
            appState: { current: () => 'active', subscribe: () => () => undefined },
          },
        ),
    ).toThrow('Unencrypted HTTP');
  });
});

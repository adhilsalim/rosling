/* Shared presentation state: which slide is showing, and when the talk and the slide started.
   With a server (rosling dev / rosling present) the state lives in the server's hub (src/node/remote.ts),
   so the viewer, the presenter and the phone remote all move together. Opened as plain files,
   there is no server, and the same state is kept in this page only. */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface DeckState {
  index: number;
  presenting: boolean;
  talkStart: number;     // in server time; see offset
  slideStart: number;
  remotes: number;       // phones connected
}

export type Dir = 'next' | 'prev' | 'first' | 'last';

export interface Sync extends DeckState {
  connected: boolean;
  offset: number;        // server clock − this device's clock, so a phone with a wrong clock still shows the right times
  goto(index: number): void;
  nav(dir: Dir): void;
  present(on: boolean): void;
}

const WS_PATH = '/__rosling/ws';

export function useSync(total: number, role: 'deck' | 'remote', initial = 0): Sync {
  const [state, setState] = useState<DeckState>({ index: initial, presenting: false, talkStart: 0, slideStart: 0, remotes: 0 });
  const [connected, setConnected] = useState(false);
  const [offset, setOffset] = useState(0);
  const ws = useRef<WebSocket | null>(null);
  const indexRef = useRef(initial);
  indexRef.current = state.index;

  useEffect(() => {
    if (location.protocol === 'file:') return;
    let stop = false, retry = 0, timer = 0;
    const open = () => {
      const s = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${WS_PATH}?role=${role}`);
      ws.current = s;
      s.onopen = () => {
        retry = 0;
        setConnected(true);
        // the page's own slide (from its address) is only a wish: the hub ignores it during a talk
        if (role === 'deck') s.send(JSON.stringify({ t: 'hello', total, index: indexRef.current }));
      };
      s.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.t !== 'state') return;
        setOffset(m.now - Date.now());
        setState({ index: m.index, presenting: m.presenting, talkStart: m.talkStart, slideStart: m.slideStart, remotes: m.remotes });
      };
      s.onclose = () => {
        if (ws.current === s) ws.current = null;
        setConnected(false);
        if (!stop) timer = window.setTimeout(open, Math.min(5000, 500 * 2 ** retry++));
      };
    };
    open();
    return () => { stop = true; clearTimeout(timer); ws.current?.close(); };
  }, [role, total]);

  const send = (m: object) => {
    if (ws.current?.readyState === WebSocket.OPEN) { ws.current.send(JSON.stringify(m)); return true; }
    return false;
  };

  // without a server, apply the same rules locally
  const goto = useCallback((i: number) => {
    if (send({ t: 'goto', index: i })) return;
    setState((s) => {
      const index = Math.max(0, Math.min(total - 1, i));
      return index === s.index ? s : { ...s, index, slideStart: Date.now() };
    });
  }, [total]);

  const nav = useCallback((dir: Dir) => {
    if (send({ t: 'nav', dir })) return;
    setState((s) => {
      const index = Math.max(0, Math.min(total - 1, dir === 'next' ? s.index + 1 : dir === 'prev' ? s.index - 1 : dir === 'first' ? 0 : total - 1));
      return index === s.index ? s : { ...s, index, slideStart: Date.now() };
    });
  }, [total]);

  const present = useCallback((on: boolean) => {
    if (send({ t: 'present', on })) return;
    setState((s) => (on ? { ...s, presenting: true, talkStart: Date.now(), slideStart: Date.now() } : { ...s, presenting: false }));
  }, []);

  return { ...state, connected, offset: connected ? offset : 0, goto, nav, present };
}

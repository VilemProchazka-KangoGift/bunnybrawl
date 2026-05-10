/// <reference lib="webworker" />

/** SAB hello-world worker. Receives a SharedArrayBuffer view, ticks slot 1
 *  via Atomics.add at 60Hz, and posts back when it sees main advance slot 0.
 *  No other deps — kept tiny so this stays a foundational sanity check. */

interface InitMsg {
  type: 'init';
  sab: SharedArrayBuffer;
}

const ctxScope = self as DedicatedWorkerGlobalScope;

ctxScope.onmessage = (e: MessageEvent<InitMsg>): void => {
  if (e.data.type !== 'init') return;
  const view = new Int32Array(e.data.sab);
  // Slot 0 = main's counter, Slot 1 = worker's counter.
  let lastMainSeen = 0;
  const tick = (): void => {
    Atomics.add(view, 1, 1);
    const main = Atomics.load(view, 0);
    if (main !== lastMainSeen) lastMainSeen = main;
    setTimeout(tick, 1000 / 60);
  };
  tick();
  // Acknowledge so main knows worker has the view.
  ctxScope.postMessage({ type: 'ready' });
};

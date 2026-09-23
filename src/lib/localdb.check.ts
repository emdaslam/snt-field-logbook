import assert from "node:assert/strict";

/**
 * The app must never sit forever on "Loading logbook…" when the WebView's
 * IndexedDB misbehaves. A "blocked" open (another connection holding the
 * upgrade) has to reject, and a later read has to retry instead of reusing the
 * rejected promise.
 */
type FakeRequest = {
  result?: unknown;
  onupgradeneeded?: () => void;
  onblocked?: () => void;
  onsuccess?: () => void;
  onerror?: () => void;
};

let opens = 0;
const fakeIndexedDB = {
  open() {
    opens++;
    const req: FakeRequest = {};
    if (opens === 1) {
      setTimeout(() => req.onblocked?.(), 0);
    } else {
      setTimeout(() => {
        const getReq: { result?: unknown; onsuccess?: () => void } = {};
        req.result = {
          objectStoreNames: { contains: () => true },
          transaction() {
            const store = { get: () => getReq };
            setTimeout(() => getReq.onsuccess?.(), 0);
            return { objectStore: () => store };
          },
        };
        req.onsuccess?.();
      }, 0);
    }
    return req;
  },
};
(globalThis as { indexedDB?: unknown }).indexedDB = fakeIndexedDB;

async function main() {
  const { readTable } = await import("./localdb");

  // First open is blocked: the read must reject, not hang.
  await assert.rejects(readTable("stations"));

  // The rejected connection was discarded, so the next read retries and works.
  assert.deepEqual(await readTable("stations"), []);
  assert.equal(opens, 2);

  console.log("localdb check ok");
}

void main();

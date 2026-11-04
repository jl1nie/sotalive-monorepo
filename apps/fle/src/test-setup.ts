// Node 25 以降は、組み込みの localStorage(Web Storage)が globalThis にあり、
// `--localstorage-file` がないと undefined になる。vitest の jsdom 環境の localStorage を隠してしまい、
// テストが `localStorage.clear()` で落ちる(CI の Node 20 では起きない)。
// jsdom の環境のときだけ、jsdom 側の Storage を globalThis に戻す。
const dom = (globalThis as { jsdom?: { window: Window } }).jsdom
if (dom) {
  for (const key of ['localStorage', 'sessionStorage'] as const) {
    if (!(globalThis as Record<string, unknown>)[key]) {
      Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true })
    }
  }
}

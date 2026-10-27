/** DOM を組み立てる小さな関数(外から来る文字列は、必ず textContent で入れるので、HTML として解釈されない) */
export type Child = Node | string | null | false | undefined

type Props = {
  [key: string]: string | number | boolean | EventListener | null | undefined
}

/**
 * h('button', { class: 'btn', type: 'button', 'on:click': handler }, '開く')
 * - 'on:xxx' はイベント、true の属性は空の属性、false・null・undefined は付けない
 */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue
    if (key.startsWith('on:')) el.addEventListener(key.slice(3), value as EventListener)
    else el.setAttribute(key, value === true ? '' : String(value))
  }
  for (const c of children) if (c !== null && c !== false && c !== undefined) el.append(c)
  return el
}

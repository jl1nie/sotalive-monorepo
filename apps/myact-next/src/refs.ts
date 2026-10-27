/**
 * ポップアップの見出しと、マーカーの常時表示の文字に出す、参照(旧版 `selectRef`)。
 * POTA・JAFF の参照は、設定(pota_ref・jaff_ref)で、出すものを選ぶ。リンクにするのは、ポップアップのときだけ。
 * 出力は、旧版と同じ行・同じ順序: [POTA]/[JAFF] [SOTA]、続けて、改行して名前。
 */
import { h, type Child } from './dom.ts'

export interface Area {
  pota?: string
  jaff?: string
  /** SOTA のコードと山名("JA/KN-006 Ooyama")。コードだけは、リンクに使う */
  sota?: string
  sota_code?: string
  name?: string
}
export interface RefPrefs {
  pota_ref: boolean
  jaff_ref: boolean
}

const potaUrl = (code: string) => `https://pota.app/#/park/${encodeURIComponent(code)}`
const wwffUrl = (code: string) => `https://wwff.co/directory/?showRef=${encodeURIComponent(code)}`
const sotaUrl = (code: string) => `https://summits.sota.org.uk/summit/${encodeURIComponent(code)}`

const link = (href: string, text: string) => h('a', { target: '_blank', rel: 'noopener', href }, text)

/** 見出しの中身(なければ空)。addHref なら、参照をリンクにする(ポップアップ)。そうでなければ、文字だけ(マーカーの常時表示) */
export function referenceNodes(area: Area, prefs: RefPrefs, addHref: boolean): Child[] {
  const out: Child[] = []
  if (area.pota !== undefined && area.jaff !== undefined) {
    if (area.pota !== '' && prefs.pota_ref) {
      out.push(addHref && area.pota.includes('-') ? link(potaUrl(area.pota), area.pota) : area.pota)
      if (addHref && area.pota.includes('-')) out.push(' ')
      if (area.jaff !== '' && prefs.jaff_ref) {
        out.push('/')
        out.push(addHref && area.jaff.includes('-') ? link(wwffUrl(area.jaff), area.jaff) : area.jaff)
        if (addHref && area.jaff.includes('-')) out.push(' ')
      }
    } else if (prefs.jaff_ref) {
      out.push(addHref ? link(wwffUrl(area.jaff), area.jaff) : area.jaff)
      if (addHref) out.push(' ')
    }
  }
  if (area.sota) {
    const sota = link(sotaUrl(area.sota_code ?? ''), area.sota)
    if (out.length === 0) out.push(sota)
    else out.push(' ', sota)
  }
  if (out.length > 0 && area.name) out.push(h('br'), area.name)
  return out
}

/** 中央揃えの見出し(なければ null) */
export function referenceHeading(area: Area, prefs: RefPrefs, addHref: boolean): HTMLElement | null {
  const nodes = referenceNodes(area, prefs, addHref)
  return nodes.length === 0 ? null : h('div', { class: 'act-heading' }, ...nodes)
}

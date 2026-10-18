import type { FieldError, Station } from '@/lib/fle'

/** 自局と運用場所の入力欄の値(公園は、空白で区切った1つの文字列) */
export type Values = Record<FieldError['field'], string>

export function toValues(s: Station): Values {
  return { mycall: s.mycall, sota: s.sota, pota: s.pota.join(' '), wwff: s.wwff, grid: s.grid }
}

/** 入力欄の値から、コアに渡す自局・運用場所にする(公園の欄は、コアが空白・カンマで分ける) */
export function toStation(v: Values): Station {
  return { mycall: v.mycall, sota: v.sota, pota: [v.pota], wwff: v.wwff, grid: v.grid }
}

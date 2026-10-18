import { useCallback, useEffect, useRef, useState } from 'react'
import type { Settings } from '@/hooks/useSettings'
import type { PlanRecord } from '@/lib/plans'
import {
  SyncError,
  generateCode,
  join,
  loadSyncState,
  pickSettings,
  removeRemote,
  saveSyncState,
  sameDoc,
  syncOnce,
  type SyncDoc,
  type SyncState,
} from '@/lib/sync'

/** off: 同期していない。unavailable: サーバーに同期の用意がない。offline: つながらない */
export type SyncStatus = 'off' | 'idle' | 'syncing' | 'offline' | 'unavailable' | 'error'

interface Args {
  settings: Settings
  update: (patch: Partial<Settings>) => void
  records: PlanRecord[]
  replacePlans: (records: PlanRecord[]) => void
}

/** 同じ設定・予定の変更を送るまでの待ち(ms)。続けて変えるときに、何度も送らない */
const DEBOUNCE_MS = 1200

/**
 * 設定と予定の同期。端末の内容が主で、つながっているときに、サーバーと合わせる。
 * 同期コードがなければ(`state` が null)、何もしない。
 */
export function useSync({ settings, update, records, replacePlans }: Args) {
  const [state, setState] = useState<SyncState | null>(loadSyncState)
  const [status, setStatus] = useState<SyncStatus>(state ? 'idle' : 'off')
  const [lastAt, setLastAt] = useState<number | null>(null)
  const stateRef = useRef(state)
  const running = useRef(false)
  const again = useRef(false)

  const doc: SyncDoc = { settings: pickSettings(settings), plans: records }
  const docRef = useRef(doc)
  useEffect(() => {
    docRef.current = doc
  })
  const key = JSON.stringify(doc)

  /** 同期した内容を、端末に反映する(変わったときだけ) */
  const apply = useCallback(
    (merged: SyncDoc) => {
      if (sameDoc(merged, docRef.current)) return
      update(merged.settings)
      replacePlans(merged.plans)
    },
    [update, replacePlans]
  )

  const fail = useCallback((e: unknown) => {
    const kind = e instanceof SyncError ? e.kind : 'invalid'
    setStatus(kind === 'network' ? 'offline' : kind === 'unavailable' ? 'unavailable' : 'error')
  }, [])

  const run = useCallback(async () => {
    const st = stateRef.current
    if (!st) return
    if (running.current) {
      again.current = true
      return
    }
    running.current = true
    setStatus('syncing')
    try {
      const { state: next, merged } = await syncOnce(st, docRef.current)
      stateRef.current = next
      saveSyncState(next)
      setState(next)
      apply(merged)
      setStatus('idle')
      setLastAt(Date.now())
    } catch (e) {
      fail(e)
    } finally {
      running.current = false
      if (again.current) {
        again.current = false
        void run()
      }
    }
  }, [apply, fail])

  // 内容を変えたら送る。同期のたびに state(最後に同期した内容)は新しくなるが、それでは送り直さない
  // (state を依存に入れると、同期するたびに次の同期が始まり、終わらなくなる)
  const code = state?.code ?? null
  useEffect(() => {
    if (!code) return
    const id = window.setTimeout(() => void run(), DEBOUNCE_MS)
    return () => window.clearTimeout(id)
  }, [key, run, code])

  useEffect(() => {
    void run()
    const onVisible = () => document.visibilityState === 'visible' && void run()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onVisible)
    }
  }, [run])

  /** 同期コードに参加する(`create` も、新しいコードで参加する)。失敗したら、理由を投げる */
  const joinWith = useCallback(
    async (code: string) => {
      setStatus('syncing')
      try {
        const { state: next, merged } = await join(code, docRef.current)
        stateRef.current = next
        saveSyncState(next)
        setState(next)
        apply(merged)
        setStatus('idle')
        setLastAt(Date.now())
      } catch (e) {
        setStatus(stateRef.current ? 'idle' : 'off')
        throw e
      }
    },
    [apply]
  )

  const create = useCallback(async () => {
    const code = generateCode()
    await joinWith(code)
    return code
  }, [joinWith])

  /** 同期をやめる。`deleteRemote` なら、サーバーの設定・予定も消す(失敗しても、端末の同期はやめる) */
  const leave = useCallback(async (deleteRemote: boolean) => {
    const st = stateRef.current
    stateRef.current = null
    saveSyncState(null)
    setState(null)
    setStatus('off')
    if (st && deleteRemote) await removeRemote(st.code).catch(() => undefined)
  }, [])

  return { code: state?.code ?? null, status, lastAt, create, joinWith, leave, syncNow: run }
}

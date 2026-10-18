import { useEffect, useId, useRef, type ReactNode } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** 「閉じる」の上に置く操作(任意) */
  actions?: ReactNode
}

/** 画面下から出るシート。スマホでは下から、広い画面では中央に出る。 */
export function Sheet({ open, onClose, title, children, actions }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        // 枠の外(暗い背景)をタップしたら閉じる
        if (e.target === ref.current) onClose()
      }}
      aria-labelledby={titleId}
      className="w-[min(32rem,100%)] max-w-none max-h-[85dvh] mt-auto mb-0 sm:my-auto mx-auto p-0 overflow-auto rounded-t-2xl sm:rounded-2xl border-2 border-gray-300 dark:border-gray-700 bg-white text-gray-950 dark:bg-gray-900 dark:text-gray-50 backdrop:bg-black/60"
    >
      <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <h2 id={titleId} className="text-xl font-bold mb-3">
          {title}
        </h2>
        {children}
        {actions && <div className="mt-4 space-y-2">{actions}</div>}
        <button
          type="button"
          onClick={onClose}
          className={`${actions ? 'btn-secondary' : 'btn-primary'} w-full mt-2`}
        >
          閉じる
        </button>
      </div>
    </dialog>
  )
}

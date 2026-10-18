import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { Sheet } from '@/components/Sheet'
import { useT } from '@/lib/i18n'

interface Props {
  open: boolean
  onClose: () => void
  /** 読み取った文字(同期のQRかの判定は、呼び出し側) */
  onScan: (text: string) => void
}

/**
 * アプリの中のカメラで QR を読む(iPhone のホーム画面のアプリは、カメラアプリで読んでも、アプリに届かないため)。
 * Safari に標準の読み取り(BarcodeDetector)がないので、画面の映像から jsQR で解読する。映像は、端末の外に出さない。
 */
export function QrScanSheet(props: Props) {
  return props.open ? <Scanner {...props} /> : null
}

function Scanner({ onClose, onScan }: Props) {
  const t = useT()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [problem, setProblem] = useState<'denied' | 'unsupported' | null>(null)
  // 読み取りのコールバックを最新に保つ(カメラを開き直さない)
  const scanRef = useRef(onScan)
  useEffect(() => {
    scanRef.current = onScan
  })

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      // 外部の状態(端末の機能)を見て、案内を決める
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProblem('unsupported')
      return
    }
    let stopped = false
    let stream: MediaStream | null = null
    let timer = 0
    const canvas = document.createElement('canvas')

    const tick = () => {
      const video = videoRef.current
      if (stopped || !video) return
      if (video.readyState >= 2 && video.videoWidth > 0) {
        // 解読は重いので、縮めて(幅 480 まで)、約 8 回/秒
        const scale = Math.min(1, 480 / video.videoWidth)
        canvas.width = Math.round(video.videoWidth * scale)
        canvas.height = Math.round(video.videoHeight * scale)
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
          const found = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' })
          if (found?.data) {
            scanRef.current(found.data)
            return
          }
        }
      }
      timer = window.setTimeout(tick, 120)
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then((s) => {
        if (stopped) {
          s.getTracks().forEach((track) => track.stop())
          return
        }
        stream = s
        const video = videoRef.current
        if (video) {
          video.srcObject = s
          void video.play().catch(() => undefined)
        }
        tick()
      })
      .catch(() => !stopped && setProblem('denied'))

    return () => {
      stopped = true
      window.clearTimeout(timer)
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  return (
    <Sheet open onClose={onClose} title={t('scan.title')}>
      {problem ? (
        <p role="alert" className="font-semibold text-red-700 dark:text-red-300">
          {t(problem === 'denied' ? 'scan.denied' : 'scan.unsupported')}
        </p>
      ) : (
        <>
          <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">{t('scan.hint')}</p>
          {/* iOS は、playsInline と muted がないと、映像が全画面になったり、再生されない */}
          <video ref={videoRef} playsInline muted className="w-full rounded-xl bg-black aspect-square object-cover" />
        </>
      )}
    </Sheet>
  )
}

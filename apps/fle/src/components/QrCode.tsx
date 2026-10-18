import { useMemo } from 'react'
import { renderSVG } from 'uqr'

/** QR コード(SVG)。暗い背景でも読めるよう、白地に黒で描く */
export function QrCode({ text, label }: { text: string; label: string }) {
  const svg = useMemo(() => renderSVG(text, { ecc: 'M', border: 2, whiteColor: '#ffffff', blackColor: '#000000' }), [text])
  return (
    <div
      role="img"
      aria-label={label}
      className="w-56 h-56 max-w-full mx-auto rounded-lg bg-white p-1 [&_svg]:w-full [&_svg]:h-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

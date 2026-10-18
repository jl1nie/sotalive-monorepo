/** ADIFのフィールド(`<名前:長さ>値`)を、宣言された長さで切り出す。 */
function parseFields(record: string): Map<string, string> {
  const fields = new Map<string, string>()
  const header = /<([A-Za-z0-9_]+):(\d+)(?::[A-Za-z])?>/g
  let m: RegExpExecArray | null
  while ((m = header.exec(record))) {
    const start = header.lastIndex
    fields.set(m[1].toUpperCase(), record.slice(start, start + Number(m[2])))
    header.lastIndex = start + Number(m[2])
  }
  return fields
}

/** ADIFテキストをFLE形式に変換する(ログの追記用)。 */
export function adif2fle(adifText: string): string {
  let today = ''
  let mode = ''
  let band = ''
  let result = ''

  for (const record of adifText.split(/<EOR>/i)) {
    const f = parseFields(record)
    const call = f.get('CALL')?.trim().toUpperCase()
    const day = f.get('QSO_DATE')
    const time = f.get('TIME_ON')
    if (!call || !day || !time) continue

    let qso = ''
    if (day !== today) {
      qso += `date ${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}\r\n`
      today = day
    }

    const newMode = f.get('MODE')?.trim().toUpperCase()
    const newBand = f.get('BAND')?.trim().toUpperCase()
    if ((newBand && newBand !== band) || (newMode && newMode !== mode)) {
      if (newBand) band = newBand
      if (newMode) mode = newMode
      qso += `${band.toLowerCase()} ${mode}\r\n`
    }

    const rstSent = f.get('RST_SENT')?.trim() || '599'
    const rstRcvd = f.get('RST_RCVD')?.trim() || '599'
    qso += `${time.slice(0, 4)} ${call} ${rstSent} ${rstRcvd}\r\n`

    result += qso
  }
  return result
}

// API response types

export interface FLECompileResponse {
  status: 'OK' | 'NG'
  logtype: string
  mycall: string
  operator: string
  mysota: string
  mywwff: string
  mypota: string[]
  qslmsg: string
  logtext: string[][]
  hamlogtext: string[][]
}

// Binary file download (ZIP)
export type FLEGenerateResponse = Blob

// HAMLOG CSV Check Response
// サーバー(sotaapp2)の応答は snake_case。空の項目は省かれる
export interface LogConvCheckResponse {
  status: 'OK' | 'NG'
  error?: string
  error_log?: string[]
  log_text?: string[][]
  file_list?: string[]
}

// HAMLOG Convert Response (binary ZIP download)
// Binary file download (ZIP with ADIF files)
export type LogConvResponse = Blob

// POTA ADIF Conversion Response (JSON)
export interface POTAConversionResponse {
  status: 'OK' | 'NG'
  error_log: string[]
  log_text: string[][]
  file_list: string[]
  files: Record<string, string>
}

// WSPR SVG Response
export interface WSPRSvgResponse {
  svg: string
}

// API error
export interface ApiError {
  message: string
  code?: string
}

// QSO Record for preview table
export interface QSORecord {
  callsign: string
  date: string
  time: string
  band: string
  mode: string
  rstSent: string
  rstRcvd: string
  sigInfo: string
  mySigInfo: string
  station: string
  operator: string
  hasError?: boolean
  errorMessage?: string
}

// Conversion Options
export interface ConversionOptions {
  format: 'pota' | 'sota_a' | 'sota_c' | 'wwff'
  callsign?: string
  myQTH: 'form' | 'rmks1' | 'rmks2'
  QTH: 'none' | 'rmks1' | 'rmks2' | 'qth'
  Park?: string
  Summit?: string
  POTAActivator?: string
  POTAOperator?: string
  SOTAActivator?: string
}

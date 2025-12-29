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

export interface FLEGenerateResponse {
  // Binary file download (ZIP)
}

// HAMLOG CSV Check Response
export interface LogConvCheckResponse {
  status: 'OK' | 'NG'
  errorlog?: string
  logtext: string[][]
  filelist: string[]
}

// HAMLOG Convert Response (binary ZIP download)
export interface LogConvResponse {
  // Binary file download (ZIP with ADIF files)
}

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
  format: 'pota' | 'sota_a' | 'sota_c' | 'wwff' | 'airham'
  callsign?: string
  myQTH: 'form' | 'rmks1' | 'rmks2'
  QTH: 'none' | 'rmks1' | 'rmks2' | 'qth'
  Park?: string
  Summit?: string
  POTAActivator?: string
  POTAOperator?: string
  SOTAActivator?: string
}

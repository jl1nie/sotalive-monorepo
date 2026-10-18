// Tab types
export type TabId =
  | 'pota-activator'
  | 'sota-activator'
  | 'sota-chaser'
  | 'wspr'

export interface Tab {
  id: TabId
  label: string
  icon?: string
}

// Form field types - match Rust API
export type MyQTHOption = 'form' | 'rmks1' | 'rmks2'
export type HisQTHOption = 'none' | 'rmks1' | 'rmks2' | 'qth'
export type NoteOption = 'form' | 'none'
export type PortableOption = 'yes' | 'no'

// Legacy alias for backwards compatibility
export type QTHOption = 'form' | 'adif' | 'none' | 'rmks1' | 'rmks2' | 'qth'

// SOTA/POTA Activator form
export interface ActivatorFormData {
  file: File | null
  callsign: string
  operator?: string
  park?: string
  summit?: string
  myQTH: MyQTHOption
  hisQTH: HisQTHOption
  portable?: PortableOption
  note?: NoteOption
}

// SOTA Chaser form
export interface ChaserFormData {
  file: File | null
  callsign: string
  hisQTH: HisQTHOption
}

// FLE form
export interface FLEFormData {
  text: string
  mycall: string
  mywwff?: string
  mysota?: string
  mypota?: string
  nickname?: string
}

// WSPR form
export interface WSPRFormData {
  title: string
  callsign: string
  band: string
  startDate: string
  endDate: string
  file: File | null
}


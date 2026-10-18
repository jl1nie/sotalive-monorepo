//! FLEパーサー共通型定義

use std::collections::HashMap;
use std::fmt;

use chrono::{DateTime, FixedOffset, NaiveDate, NaiveDateTime, TimeZone, Utc};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};

/// モードテーブル: モード名 -> RST種別
pub static MODE_TABLE: Lazy<HashMap<&'static str, RstType>> = Lazy::new(|| {
    let mut m = HashMap::new();
    m.insert("cw", RstType::Rst);
    m.insert("ssb", RstType::Rs);
    m.insert("fm", RstType::Rs);
    m.insert("am", RstType::Rs);
    m.insert("rtty", RstType::Rst);
    m.insert("rty", RstType::Rst);
    m.insert("psk", RstType::Rst);
    m.insert("psk31", RstType::Rst);
    m.insert("jt9", RstType::Snr);
    m.insert("jt65", RstType::Snr);
    m.insert("ft8", RstType::Snr);
    m.insert("ft4", RstType::Snr);
    m.insert("js8", RstType::Snr);
    m.insert("dv", RstType::Rs);
    m.insert("fusion", RstType::Rs);
    m.insert("dstar", RstType::Rs);
    m.insert("d-star", RstType::Rs);
    m.insert("dmr", RstType::Rs);
    m.insert("c4fm", RstType::Rs);
    m.insert("freedv", RstType::Rs);
    m
});

/// キーワードテーブル: キーワード -> 引数の数 (-1 = 行末まで)
pub static KEYWORD_TABLE: Lazy<HashMap<&'static str, i8>> = Lazy::new(|| {
    let mut m = HashMap::new();
    m.insert("mycall", 1);
    m.insert("operator", 1);
    m.insert("qslmsg", -1);
    m.insert("qslmsg2", -1);
    m.insert("mywwff", 1);
    m.insert("mysota", 1);
    m.insert("mypota", 1); // 複数引数可能
    m.insert("nickname", 1);
    m.insert("date", 1);
    m.insert("day", 1);
    m.insert("rigset", 1);
    m.insert("timezone", 1);
    m.insert("number", 1);
    m.insert("consecutive", 0);
    m
});

/// RST種別
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RstType {
    /// RST (CW, RTTY等): 3桁
    Rst,
    /// RS (SSB, FM等): 2桁
    Rs,
    /// S/N比 (FT8等): +/-値
    Snr,
}

/// FLEコンパイル環境
#[derive(Debug, Clone)]
pub struct FleEnvironment {
    // グローバル設定
    pub mycall: String,
    pub operator: String,
    pub qslmsg: String,
    pub qslmsg2: String,
    pub mywwff: String,
    pub mysota: String,
    pub mypota: Vec<String>,
    pub nickname: String,
    pub rigset: u8,
    pub timezone: Option<i32>,

    // 基準日付
    pub year: u16,
    pub month: u8,
    pub day: u8,

    // 現在のQSO状態
    pub current: CurrentQsoState,

    // エラーログ
    pub errors: Vec<FleError>,

    // コンテスト設定
    pub contest_num: Option<u32>,
    pub contest_lit: Option<String>,
}

/// 現在のQSO状態
#[derive(Debug, Clone, Default)]
pub struct CurrentQsoState {
    // 日時
    pub year: u16,
    pub month: u8,
    pub day: u8,
    pub hour: u8,
    pub min: u8,

    // バンド/周波数/モード
    pub band: String,
    pub freq: String,
    pub mode: String,
    pub rigset: u8,

    // 相手局情報
    pub call: String,
    pub his_wwff: String,
    pub his_sota: String,
    pub his_pota: Vec<String>,

    // RST
    pub rst_sent: RstValue,
    pub rst_rcvd: RstValue,

    // コンテスト
    pub his_num: String,
    pub my_num: String,

    // コメント
    pub qso_msg: String,
    pub qso_rmks: String,
    pub qsl_msg: String,
}

/// RST値
#[derive(Debug, Clone)]
pub enum RstValue {
    /// RST形式 (R, S, T)
    Rst { r: u8, s: u8, t: u8 },
    /// RS形式 (R, S)
    Rs { r: u8, s: u8 },
    /// S/N比
    Snr(String),
}

impl fmt::Display for RstValue {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            RstValue::Rst { r, s, t } => write!(f, "{}{}{}", r, s, t),
            RstValue::Rs { r, s } => write!(f, "{}{}", r, s),
            RstValue::Snr(v) => write!(f, "{}", v),
        }
    }
}

impl Default for RstValue {
    fn default() -> Self {
        RstValue::Rst { r: 5, s: 9, t: 9 }
    }
}

impl RstValue {
    /// デフォルトのRS値
    pub fn default_rs() -> Self {
        RstValue::Rs { r: 5, s: 9 }
    }

    /// デフォルトのSNR値
    pub fn default_snr() -> Self {
        RstValue::Snr("-10".to_string())
    }

    /// 数値からRSTをパース
    pub fn parse_rst(value: u32, digits: usize) -> Self {
        match digits {
            1 => RstValue::Rst {
                r: 5,
                s: (value % 10) as u8,
                t: 9,
            },
            2 => RstValue::Rs {
                r: ((value / 10) % 10) as u8,
                s: (value % 10) as u8,
            },
            3 => RstValue::Rst {
                r: ((value / 100) % 10) as u8,
                s: ((value / 10) % 10) as u8,
                t: (value % 10) as u8,
            },
            _ => RstValue::default(),
        }
    }
}

/// FLEエラー
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FleError {
    pub line: usize,
    pub column: usize,
    pub message: String,
}

impl FleError {
    pub fn new(line: usize, column: usize, message: impl Into<String>) -> Self {
        Self {
            line,
            column,
            message: message.into(),
        }
    }
}

impl Default for FleEnvironment {
    fn default() -> Self {
        Self {
            mycall: String::new(),
            operator: String::new(),
            qslmsg: String::new(),
            qslmsg2: String::new(),
            mywwff: String::new(),
            mysota: String::new(),
            mypota: Vec::new(),
            nickname: String::new(),
            rigset: 0,
            timezone: None,
            year: 2000,
            month: 1,
            day: 1,
            current: CurrentQsoState::default(),
            errors: Vec::new(),
            contest_num: None,
            contest_lit: None,
        }
    }
}

impl FleEnvironment {
    /// 日時をUTCに変換
    pub fn to_utc(&self) -> NaiveDateTime {
        let naive = NaiveDate::from_ymd_opt(
            self.current.year as i32,
            self.current.month as u32,
            self.current.day as u32,
        )
        .unwrap_or_default()
        .and_hms_opt(self.current.hour as u32, self.current.min as u32, 0)
        .unwrap_or_default();

        if let Some(tz_offset) = self.timezone {
            let offset = FixedOffset::east_opt(tz_offset * 3600)
                .unwrap_or(FixedOffset::east_opt(0).unwrap());
            let local: DateTime<FixedOffset> = offset.from_local_datetime(&naive).unwrap();
            local.with_timezone(&Utc).naive_utc()
        } else {
            naive
        }
    }

    /// 現在のQSOをリセット (次のQSOの準備)
    pub fn reset_current_qso(&mut self) {
        self.current.call.clear();
        self.current.his_wwff.clear();
        self.current.his_sota.clear();
        self.current.his_pota.clear();
        self.current.qso_msg.clear();
        self.current.qso_rmks.clear();
        self.current.qsl_msg.clear();
        self.current.his_num.clear();
        self.current.my_num.clear();
        self.current.rst_sent = RstValue::default();
        self.current.rst_rcvd = RstValue::default();
    }

    /// エラーを追加
    pub fn add_error(&mut self, line: usize, column: usize, message: impl Into<String>) {
        self.errors.push(FleError::new(line, column, message));
    }
}

/// コンパイル済みQSOレコード
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FleQsoRecord {
    pub mycall: String,
    pub operator: String,
    pub year: u16,
    pub month: u8,
    pub day: u8,
    pub hour: u8,
    pub min: u8,
    pub callsign: String,
    pub band: String,
    pub freq: String,
    pub mode: String,
    pub rigset: u8,
    pub rst_sent: String,
    pub rst_rcvd: String,
    pub his_num: String,
    pub my_num: String,
    pub mysota: String,
    pub hissota: String,
    pub mywwff: String,
    pub hiswwff: String,
    pub mypota: Vec<String>,
    pub hispota: Vec<String>,
    pub qsomsg: String,
    pub qsormks: String,
    pub qslmsg: String,
}

/// FLEコンパイル結果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FleCompileResult {
    pub status: String,
    pub log_type: String,
    pub mycall: String,
    pub operator: String,
    pub mysota: String,
    pub mywwff: String,
    pub mypota: Vec<String>,
    pub qslmsg: String,
    pub records: Vec<FleQsoRecord>,
    pub errors: Vec<FleError>,
    pub has_sota: bool,
    pub has_wwff: bool,
    pub has_pota: bool,
    pub has_contest: bool,
}

impl Default for FleCompileResult {
    fn default() -> Self {
        Self {
            status: "OK".to_string(),
            log_type: "NONE".to_string(),
            mycall: String::new(),
            operator: String::new(),
            mysota: String::new(),
            mywwff: String::new(),
            mypota: Vec::new(),
            qslmsg: String::new(),
            records: Vec::new(),
            errors: Vec::new(),
            has_sota: false,
            has_wwff: false,
            has_pota: false,
            has_contest: false,
        }
    }
}

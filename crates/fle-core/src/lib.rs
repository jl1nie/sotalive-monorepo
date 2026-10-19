//! FLE (Fast Log Entry) パーサー
//!
//! FLE形式のテキストをパースし、QSOレコードに変換する。
//!
//! # FSM設計
//!
//! ## トークナイザー
//! 入力テキストを以下のトークン型に分類:
//! - `Date` / `Date2` - 日付 (YYYY-MM-DD, MM-DD)
//! - `Freq` - 周波数 (7.025)
//! - `Band` - バンド (40m, 2m)
//! - `Snr` - S/N比 (+10, -15)
//! - `WwffRef` / `SotaRef` / `PotaRef` - リファレンス
//! - `Keyword` - ディレクティブ (mycall, mysota, etc.)
//! - `Mode` - モード (CW, SSB, FT8)
//! - `Call` - コールサイン
//! - `Decimal` - 数値 (時刻、RST)
//! - `Comment` - コメント (<...>, [...], {...})
//! - `ContestSent` / `ContestRcvd` - コンテストナンバー
//! - `Literal` - その他のリテラル
//!
//! ## コンパイラFSM状態
//!
//! ```text
//!                  ┌─────────────────────────────────────┐
//!                  │                                     │
//!                  ▼                                     │
//! ┌──────┐    ┌────────┐    ┌────────┐    ┌────────┐    │
//! │ Init │───▶│  Norm  │───▶│  Freq  │───▶│  Norm  │────┘
//! └──────┘    └────────┘    └────────┘    └────────┘
//!                  │                           ▲
//!                  │ call                      │
//!                  ▼                           │
//!             ┌────────┐    ┌────────┐        │
//!             │  RstS  │───▶│  RstR  │────────┘
//!             └────────┘    └────────┘
//! ```
//!
//! - **Norm**: 通常状態。モード、バンド、周波数、時刻、コールサイン等を受け付ける
//! - **Freq**: バンドの後、周波数が続く可能性がある状態
//! - **RstS**: コールサイン後、送信RSTを待つ状態
//! - **RstR**: 送信RST後、受信RSTを待つ状態
//!
//! ## ディレクティブ処理
//!
//! 行頭のキーワードはディレクティブとして処理:
//! - `mycall <call>` - 自局コールサイン設定
//! - `mysota <ref>` - SOTA山リファレンス設定
//! - `mypota <ref>...` - POTAパークリファレンス設定
//! - `mywwff <ref>` - WWFFリファレンス設定
//! - `date <date>` - 日付設定
//! - `day +/++` - 日付インクリメント
//! - `timezone +/-N` - タイムゾーン設定
//! - `qslmsg <msg>` - QSLメッセージ設定

pub mod adif;
pub mod callsign;
pub mod compiler;
pub mod complete;
pub mod fill;
pub mod ham;
pub mod line_info;
pub mod output;
pub mod sample;
pub mod station;
pub mod syntax;
pub mod types;
pub mod view;

pub use adif::*;
pub use compiler::*;
pub use complete::*;
pub use fill::*;
pub use line_info::*;
pub use output::*;
pub use sample::*;
pub use station::*;
pub use types::*;
pub use view::*;

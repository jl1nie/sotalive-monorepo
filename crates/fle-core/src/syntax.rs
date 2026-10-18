//! FLE の文法(nom)。1行を、位置つきの構文木にする。
//!
//! - **字句**: 空白、語、括弧の注釈(`<…>` `[…]` `{…}`)を、nom の部品で読む。`#` から行末は注釈。
//!   語は、現行と同じ優先順位で分類する(`classify`)。全角の英数字は、半角として読む。
//! - **行の文法**: 空行 / 指令 / QSOの行。指令の値は、指令の表(`DIRECTIVES`)の文法で読む。
//!   QSOの行は、コールサインの直後の RST(数値か SNR を最大2つ)を、コールサインの一部として読む。
//! - **位置(span)**: すべての要素が、行内の **UTF-16 の文字位置**を持つ(`fill` / `complete` の座標と同じ)。
//! - **誤り**: メッセージだけでなく、コード・引数・位置で持つ(多言語は、画面が文面を作る)。
//!
//! ここは構文だけで、意味(状態の引き継ぎ・QSOの記録)は `compiler.rs` が、構文木を畳み込んで作る。
//! 補完の候補(`expected_next`)も、ここの文法の表から導く。

use std::borrow::Cow;

use nom::{
    branch::alt,
    bytes::complete::{take_till, take_while, take_while1},
    character::complete::{char as ch, digit1, one_of},
    combinator::{all_consuming, map, value},
    sequence::tuple,
    IResult,
};

use crate::callsign::is_callsign;
use crate::ham::{band_to_freq, FREQ_TABLE};
use crate::types::MODE_TABLE;

type Res<'a, T> = IResult<&'a str, T>;

// ---------------------------------------------------------------------------
// 構文木
// ---------------------------------------------------------------------------

/// 行内の位置(開始, 終了)。UTF-16 の文字位置
pub type Span = (usize, usize);

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Spanned<T> {
    pub span: Span,
    pub node: T,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CommentKind {
    /// `<…>`: QSOメッセージ
    Angle,
    /// `[…]`: QSLメッセージ
    Square,
    /// `{…}`: 備考
    Curly,
}

/// 語の分類(上から順に、最初に当てはまるもの)
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Class {
    /// 年月日(`2026-10-18`)。桁あふれは `u32::MAX`
    Date {
        year: u32,
        month: u32,
        day: u32,
    },
    /// 月日(`10-18`)
    Date2 {
        month: u32,
        day: u32,
    },
    /// 周波数(`7.025`)
    Freq(String),
    /// SNR・符号つき整数(`-10`、`+9`)
    Snr(String),
    /// バンド(`40m`)。小文字にそろえる。`freq` はバンドの既定の周波数
    Band {
        band: String,
        freq: String,
    },
    Wwff(String),
    Sota(String),
    Pota(String),
    /// 指令のキーワード(小文字)
    Keyword(&'static str),
    /// モード(大文字)
    Mode(String),
    /// 数値(桁数を持つ)
    Decimal {
        digits: usize,
        value: String,
    },
    /// コールサイン(大文字)
    Call(String),
    ContestSent(String),
    ContestRcvd(String),
    /// `/` か `-` を含む、上のどれでもない語
    Unknown(String),
    /// それ以外の語(平文。大文字小文字は、入力のまま)
    Word(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Rst {
    Digits { digits: usize, value: String },
    Snr(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RefKind {
    Sota,
    Wwff,
    Pota,
}

/// QSOの行の要素
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum QsoItem {
    /// 数値: 時刻(桁数で、分・H:MM・HH:MM)
    Time {
        digits: usize,
        value: String,
    },
    Band {
        band: String,
        freq: String,
    },
    Freq(String),
    Mode(String),
    /// コールサイン。直後の RST(数値か SNR)を、最大2つ持つ(コメントは読み飛ばす)
    Call {
        call: String,
        rst_sent: Option<Spanned<Rst>>,
        rst_rcvd: Option<Spanned<Rst>>,
    },
    /// 相手局のリファレンス
    Ref {
        kind: RefKind,
        code: String,
    },
    ContestSent(String),
    ContestRcvd(String),
    Comment {
        kind: CommentKind,
        content: String,
        closed: bool,
    },
    /// 平文の語(大文字小文字は、入力のまま)
    Word(String),
    /// 文法上、QSOの行に置けない語(キーワード・日付・RST の位置にない SNR・不明な参照)
    Misplaced {
        class: Class,
        text: String,
    },
}

/// 日付の値(検証は、評価が行う)
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DateValue {
    Ymd { year: u32, month: u32, day: u32 },
    Md { month: u32, day: u32 },
}

/// 指令の値(文法に合ったもの)
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DirValue {
    Mycall(String),
    Operator(String),
    /// `None` は解除(`-`)
    Sota(Option<String>),
    Wwff(Option<String>),
    Pota(Option<Vec<String>>),
    Grid(Option<String>),
    Date(DateValue),
    /// 進める日数(`+` = 1、`++` = 2)
    Day(i64),
    Timezone(i32),
    Rigset(u8),
    Nickname(String),
    NumberConsecutive,
    NumberLiteral(String),
    Qslmsg(String),
    Qslmsg2(String),
}

/// 指令の値の文法
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Operand {
    /// コールサイン(`mycall`)
    Call,
    /// 運用者のコールサイン(`operator`)
    OperatorCall,
    Sota,
    Wwff,
    /// POTA の参照を1つ以上(同じ場所の公園のすべて)
    PotaList,
    Grid,
    Date,
    /// `+` か `++`
    DayStep,
    Timezone,
    Rigset,
    /// 任意の1語
    Word,
    /// `consecutive`、または任意の1語
    NumberKind,
    /// 行の残り
    Rest,
}

/// 指令の表。キーワードと値の文法の、唯一の定義(補完の候補も、ここから導く)。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DirSpec {
    pub key: &'static str,
    pub operand: Operand,
}

pub const DIRECTIVES: [DirSpec; 14] = [
    DirSpec {
        key: "mycall",
        operand: Operand::Call,
    },
    DirSpec {
        key: "operator",
        operand: Operand::OperatorCall,
    },
    DirSpec {
        key: "mysota",
        operand: Operand::Sota,
    },
    DirSpec {
        key: "mywwff",
        operand: Operand::Wwff,
    },
    DirSpec {
        key: "mypota",
        operand: Operand::PotaList,
    },
    DirSpec {
        key: "mygrid",
        operand: Operand::Grid,
    },
    DirSpec {
        key: "date",
        operand: Operand::Date,
    },
    DirSpec {
        key: "day",
        operand: Operand::DayStep,
    },
    DirSpec {
        key: "timezone",
        operand: Operand::Timezone,
    },
    DirSpec {
        key: "rigset",
        operand: Operand::Rigset,
    },
    DirSpec {
        key: "nickname",
        operand: Operand::Word,
    },
    DirSpec {
        key: "number",
        operand: Operand::NumberKind,
    },
    DirSpec {
        key: "qslmsg",
        operand: Operand::Rest,
    },
    DirSpec {
        key: "qslmsg2",
        operand: Operand::Rest,
    },
];

pub fn directive_spec(key_lower: &str) -> Option<&'static DirSpec> {
    DIRECTIVES.iter().find(|d| d.key == key_lower)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Directive {
    pub spec: &'static DirSpec,
    pub key_span: Span,
    /// 値が文法に合わなければ None(誤りは `LineAst::errors` にある)
    pub value: Option<DirValue>,
    /// 値の語(注釈を除く)の位置
    pub arg_spans: Vec<Span>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LineKind {
    /// 空行、または注釈だけの行
    Blank,
    Directive(Directive),
    Qso(Vec<Spanned<QsoItem>>),
}

/// 文法の誤り。メッセージ(英語)に加えて、コード・引数・位置を持つ。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyntaxError {
    pub code: &'static str,
    pub args: Vec<String>,
    pub span: Span,
    pub message: String,
}

impl SyntaxError {
    pub fn new(code: &'static str, args: &[&str], span: Span, message: impl Into<String>) -> Self {
        Self {
            code,
            args: args.iter().map(|s| s.to_string()).collect(),
            span,
            message: message.into(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LineAst {
    pub kind: LineKind,
    pub errors: Vec<SyntaxError>,
}

// ---------------------------------------------------------------------------
// 字句(nom)
// ---------------------------------------------------------------------------

/// 語を構成する文字。空白と、注釈の開始(`#` `<` `[` `{`)で、語は切れる。
fn is_word_char(c: char) -> bool {
    !c.is_whitespace() && !matches!(c, '#' | '<' | '[' | '{')
}

fn ws0(i: &str) -> Res<'_, &str> {
    take_while(char::is_whitespace)(i)
}

fn word(i: &str) -> Res<'_, &str> {
    take_while1(is_word_char)(i)
}

/// `<…>` / `[…]` / `{…}`。閉じていなければ、行末までが注釈で、`closed` は偽。
fn comment(i: &str) -> Res<'_, (CommentKind, &str, bool)> {
    let (i, kind) = alt((
        value(CommentKind::Angle, ch('<')),
        value(CommentKind::Square, ch('[')),
        value(CommentKind::Curly, ch('{')),
    ))(i)?;
    let close = match kind {
        CommentKind::Angle => '>',
        CommentKind::Square => ']',
        CommentKind::Curly => '}',
    };
    let (i, content) = take_till(|c| c == close)(i)?;
    let (i, closed) = map(nom::combinator::opt(ch(close)), |o| o.is_some())(i)?;
    Ok((i, (kind, content, closed)))
}

/// 行内の位置を、UTF-16 の文字位置にする
struct Conv<'a> {
    line: &'a str,
}

impl Conv<'_> {
    fn at(&self, byte: usize) -> usize {
        self.line[..byte].encode_utf16().count()
    }

    fn span(&self, from: usize, to: usize) -> Span {
        (self.at(from), self.at(to))
    }
}

/// 全角の英数字・記号(U+FF01〜U+FF5E)を、半角にする
fn fold_fullwidth(s: &str) -> Cow<'_, str> {
    if s.chars().any(|c| ('\u{FF01}'..='\u{FF5E}').contains(&c)) {
        Cow::Owned(
            s.chars()
                .map(|c| {
                    if ('\u{FF01}'..='\u{FF5E}').contains(&c) {
                        char::from_u32(c as u32 - 0xFEE0).unwrap_or(c)
                    } else {
                        c
                    }
                })
                .collect(),
        )
    } else {
        Cow::Borrowed(s)
    }
}

fn is_w(c: char) -> bool {
    c.is_alphanumeric() || c == '_'
}

fn is_digits(s: &str) -> bool {
    !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit())
}

/// 数字の並び。桁あふれは `u32::MAX`(あとで、範囲外として誤りにする)
fn num(s: &str) -> u32 {
    s.parse().unwrap_or(u32::MAX)
}

fn date3(s: &str) -> Option<(u32, u32, u32)> {
    let p: Res<'_, _> =
        all_consuming(tuple((digit1, one_of("/-"), digit1, one_of("/-"), digit1)))(s);
    p.ok().map(|(_, (y, _, m, _, d))| (num(y), num(m), num(d)))
}

fn date2(s: &str) -> Option<(u32, u32)> {
    let p: Res<'_, _> = all_consuming(tuple((digit1, one_of("/-"), digit1)))(s);
    p.ok().map(|(_, (m, _, d))| (num(m), num(d)))
}

fn is_freq(s: &str) -> bool {
    let p: Res<'_, _> = all_consuming(tuple((digit1, ch('.'), digit1)))(s);
    p.is_ok()
}

fn is_snr(s: &str) -> bool {
    let p: Res<'_, _> = all_consuming(tuple((one_of("+-"), digit1)))(s);
    p.is_ok()
}

/// `\w+FF-\d+`
fn is_wwff(s: &str) -> bool {
    s.rsplit_once('-').is_some_and(|(l, r)| {
        is_digits(r) && l.len() >= 3 && l.ends_with("FF") && l.chars().all(is_w)
    })
}

/// `\w+/\w+-\d+`
fn is_sota(s: &str) -> bool {
    s.split_once('/').is_some_and(|(a, rest)| {
        !a.is_empty()
            && a.chars().all(is_w)
            && rest
                .rsplit_once('-')
                .is_some_and(|(b, d)| !b.is_empty() && b.chars().all(is_w) && is_digits(d))
    })
}

/// `\w+-\d+`
fn is_pota(s: &str) -> bool {
    s.rsplit_once('-')
        .is_some_and(|(l, r)| !l.is_empty() && l.chars().all(is_w) && is_digits(r))
}

/// 語を分類する。上から順に、最初に当てはまるもの。同じ語は、位置に関係なく同じ分類になる。
pub fn classify(raw: &str) -> Class {
    let folded = fold_fullwidth(raw);
    let word = folded.as_ref();
    let upper = word.to_uppercase();

    if let Some((year, month, day)) = date3(&upper) {
        return Class::Date { year, month, day };
    }
    if let Some((month, day)) = date2(&upper) {
        return Class::Date2 { month, day };
    }
    if is_freq(&upper) {
        return Class::Freq(word.to_string());
    }
    if is_snr(&upper) {
        return Class::Snr(word.to_string());
    }
    if let Some(freq) = band_to_freq(word, true) {
        return Class::Band {
            band: word.to_lowercase(),
            freq: freq.to_string(),
        };
    }
    if is_wwff(&upper) {
        return Class::Wwff(upper);
    }
    if is_sota(&upper) {
        return Class::Sota(upper);
    }
    if is_pota(&upper) {
        return Class::Pota(upper);
    }
    let lower = word.to_lowercase();
    if let Some(spec) = directive_spec(&lower) {
        return Class::Keyword(spec.key);
    }
    if MODE_TABLE.contains_key(lower.as_str()) {
        return Class::Mode(upper);
    }
    if is_digits(word) {
        return Class::Decimal {
            digits: word.chars().count(),
            value: word.to_string(),
        };
    }
    if is_callsign(&upper) {
        return Class::Call(upper);
    }
    let mut chars = upper.chars();
    match (chars.next(), chars.next()) {
        (Some('.'), Some(c)) if is_w(c) => return Class::ContestSent(upper[1..].to_string()),
        (Some(','), Some(c)) if is_w(c) => return Class::ContestRcvd(upper[1..].to_string()),
        _ => {}
    }
    if upper.contains('/') || upper.contains('-') {
        return Class::Unknown(upper);
    }
    Class::Word(raw.to_string())
}

/// メイデンヘッドのグリッドロケータを、慣例の書き方(`PM95uq`)にそろえる。
/// 4・6・8文字(AA00 / AA00aa / AA00aa00)だけを受け付ける。
pub fn canonical_grid(raw: &str) -> Option<String> {
    let chars: Vec<char> = raw.chars().collect();
    if !matches!(chars.len(), 4 | 6 | 8) || !chars.iter().all(char::is_ascii_alphanumeric) {
        return None;
    }
    let letter = |c: char, last: char| c.is_ascii_alphabetic() && c.to_ascii_uppercase() <= last;
    let ok = letter(chars[0], 'R')
        && letter(chars[1], 'R')
        && chars[2].is_ascii_digit()
        && chars[3].is_ascii_digit()
        && (chars.len() < 6 || (letter(chars[4], 'X') && letter(chars[5], 'X')))
        && (chars.len() < 8 || (chars[6].is_ascii_digit() && chars[7].is_ascii_digit()));
    if !ok {
        return None;
    }
    Some(
        chars
            .iter()
            .enumerate()
            .map(|(i, c)| {
                if i < 2 {
                    c.to_ascii_uppercase()
                } else {
                    c.to_ascii_lowercase()
                }
            })
            .collect(),
    )
}

// ---------------------------------------------------------------------------
// 行の文法
// ---------------------------------------------------------------------------

/// 指令の行の、値の部分の要素(語か、注釈)
struct Arg {
    span: Span,
    raw: String,
    class: Option<Class>, // 注釈なら None
}

/// 1行を、構文木にする。誤りがあっても、その行の誤りとして残し、解析は止めない。
pub fn parse_line(line: &str) -> LineAst {
    let conv = Conv { line };
    let (rest, _) = ws0(line).unwrap_or((line, ""));
    if rest.is_empty() || rest.starts_with('#') {
        return LineAst {
            kind: LineKind::Blank,
            errors: Vec::new(),
        };
    }

    // 先頭の語が指令のキーワードなら、指令の行
    if let Ok((after_key, w)) = word(rest) {
        if let Class::Keyword(key) = classify(w) {
            let spec = directive_spec(key).expect("keyword is in the table");
            let from = line.len() - rest.len();
            let key_span = conv.span(from, line.len() - after_key.len());
            return parse_directive(&conv, spec, key_span, after_key);
        }
    }
    parse_qso(&conv)
}

// ---- 指令 ----

fn parse_directive(conv: &Conv, spec: &'static DirSpec, key_span: Span, rest: &str) -> LineAst {
    let total = conv.line.len();
    let mut args: Vec<Arg> = Vec::new();
    let mut input = rest;
    loop {
        let (i, _) = ws0(input).unwrap_or((input, ""));
        let from = total - i.len();
        if let Ok((i2, (kind, content, closed))) = comment(i) {
            let to = total - i2.len();
            let open = &conv.line[from..from + 1];
            let close = match kind {
                CommentKind::Angle => ">",
                CommentKind::Square => "]",
                CommentKind::Curly => "}",
            };
            let raw = format!("{open}{content}{}", if closed { close } else { "" });
            args.push(Arg {
                span: conv.span(from, to),
                raw,
                class: None,
            });
            input = i2;
        } else if let Ok((i2, w)) = word(i) {
            let to = total - i2.len();
            args.push(Arg {
                span: conv.span(from, to),
                raw: w.to_string(),
                class: Some(classify(w)),
            });
            input = i2;
        } else {
            break; // 行末、または `#`(行末までの注釈)
        }
    }
    let mut errors = Vec::new();
    let value = directive_value(spec, key_span, &args, &mut errors);
    let arg_spans = args
        .iter()
        .filter(|a| a.class.is_some())
        .map(|a| a.span)
        .collect();
    LineAst {
        kind: LineKind::Directive(Directive {
            spec,
            key_span,
            value,
            arg_spans,
        }),
        errors,
    }
}

/// 値の誤りを、コード・引数・位置で作る
fn operand_error(
    code: &'static str,
    key: &str,
    arg: Option<&Arg>,
    key_span: Span,
    message: String,
) -> SyntaxError {
    match arg {
        Some(a) => SyntaxError::new(code, &[key, &a.raw], a.span, message),
        None => SyntaxError::new(code, &[key], key_span, message),
    }
}

fn directive_value(
    spec: &'static DirSpec,
    key_span: Span,
    args: &[Arg],
    errors: &mut Vec<SyntaxError>,
) -> Option<DirValue> {
    let key = spec.key;
    // 値は、語だけ(注釈は、値の数に入れない)
    let words: Vec<&Arg> = args.iter().filter(|a| a.class.is_some()).collect();
    let first = words.first().copied();

    // 行の残り(qslmsg)は、注釈も含めて、1語ずつ空白でつなぐ
    if spec.operand == Operand::Rest {
        if args.is_empty() {
            errors.push(operand_error(
                "missing_operand",
                key,
                None,
                key_span,
                "Missing operand.".into(),
            ));
            return None;
        }
        let msg = args
            .iter()
            .map(|a| a.raw.as_str())
            .collect::<Vec<_>>()
            .join(" ");
        return Some(if key == "qslmsg" {
            DirValue::Qslmsg(msg)
        } else {
            DirValue::Qslmsg2(msg)
        });
    }

    let missing = |errors: &mut Vec<SyntaxError>, message: &str| {
        errors.push(operand_error(
            "missing_operand",
            key,
            None,
            key_span,
            message.to_string(),
        ));
        None
    };
    let Some(first) = first else {
        return match spec.operand {
            Operand::Sota => missing(errors, "Missing SOTA ref#."),
            Operand::Wwff => missing(errors, "Missing WWFF ref#."),
            Operand::PotaList => missing(errors, "Missing POTA ref#."),
            Operand::Grid => missing(errors, "Missing grid locator."),
            Operand::DayStep => missing(errors, "Missing operand +/++."),
            Operand::Timezone => missing(errors, "Missing timezone. (eg. +9)"),
            _ => missing(errors, "Missing operand."),
        };
    };
    let class = first.class.as_ref().expect("a word");
    let invalid = |errors: &mut Vec<SyntaxError>, message: String| {
        errors.push(operand_error(
            "invalid_operand",
            key,
            Some(first),
            key_span,
            message,
        ));
        None
    };

    // 値が1つの指令は、2つ目以降を誤りにする(PotaList は、並べるもの)
    let one_value = spec.operand != Operand::PotaList;
    let value = match spec.operand {
        Operand::Call => match class {
            Class::Call(c) => Some(DirValue::Mycall(c.clone())),
            _ => invalid(errors, "Invalid callsign.".into()),
        },
        Operand::OperatorCall => match class {
            Class::Call(c) => Some(DirValue::Operator(c.clone())),
            _ => invalid(errors, "Invalid operator.".into()),
        },
        Operand::Sota => match class {
            _ if first.raw == "-" => Some(DirValue::Sota(None)),
            Class::Sota(r) => Some(DirValue::Sota(Some(r.clone()))),
            _ => invalid(errors, format!("{} is invalid SOTA ref#.", first.raw)),
        },
        Operand::Wwff => match class {
            _ if first.raw == "-" => Some(DirValue::Wwff(None)),
            Class::Wwff(r) => Some(DirValue::Wwff(Some(r.clone()))),
            _ => invalid(errors, format!("{} is invalid WWFF ref#.", first.raw)),
        },
        Operand::PotaList => {
            if first.raw == "-" {
                // 解除(`-` のあとに、ほかの値は置けない)
                if let Some(extra) = words.get(1) {
                    errors.push(operand_error(
                        "extra_operand",
                        key,
                        Some(extra),
                        key_span,
                        format!("Unexpected extra operand: {}", extra.raw),
                    ));
                }
                return Some(DirValue::Pota(None));
            }
            let mut refs = Vec::new();
            for w in &words {
                match w.class.as_ref() {
                    Some(Class::Pota(r)) => refs.push(r.clone()),
                    _ => {
                        errors.push(operand_error(
                            "invalid_operand",
                            key,
                            Some(w),
                            key_span,
                            format!("{} is invalid POTA ref#.", w.raw),
                        ));
                        return None; // 誤りがあれば、前の指定を残す
                    }
                }
            }
            Some(DirValue::Pota(Some(refs)))
        }
        Operand::Grid => {
            if first.raw == "-" {
                Some(DirValue::Grid(None))
            } else if let Some(g) = canonical_grid(&first.raw) {
                Some(DirValue::Grid(Some(g)))
            } else {
                invalid(errors, format!("{} is invalid grid locator.", first.raw))
            }
        }
        Operand::Date => match class {
            Class::Date { year, month, day } => Some(DirValue::Date(DateValue::Ymd {
                year: *year,
                month: *month,
                day: *day,
            })),
            Class::Date2 { month, day } => Some(DirValue::Date(DateValue::Md {
                month: *month,
                day: *day,
            })),
            _ => invalid(errors, "Wrong date format.".into()),
        },
        Operand::DayStep => match class {
            Class::Word(w) if w == "+" => Some(DirValue::Day(1)),
            Class::Word(w) if w == "++" => Some(DirValue::Day(2)),
            Class::Word(_) => {
                errors.push(operand_error(
                    "unknown_operand",
                    key,
                    Some(first),
                    key_span,
                    "Unknown operand.".into(),
                ));
                None
            }
            _ => {
                errors.push(operand_error(
                    "missing_operand",
                    key,
                    Some(first),
                    key_span,
                    "Missing operand +/++.".into(),
                ));
                None
            }
        },
        Operand::Timezone => match class {
            Class::Snr(tz) => match tz.parse::<i32>() {
                Ok(v) => Some(DirValue::Timezone(v)),
                Err(_) => invalid(errors, format!("{tz} is invalid timezone.")),
            },
            _ => invalid(errors, format!("{} is invalid timezone.", first.raw)),
        },
        Operand::Rigset => match class {
            Class::Decimal { value, .. } => match value.parse::<u8>() {
                Ok(v) => Some(DirValue::Rigset(v)),
                Err(_) => invalid(errors, "Invalid Rig set#.".into()),
            },
            _ => invalid(errors, "Invalid Rig set#.".into()),
        },
        Operand::Word => Some(DirValue::Nickname(first.raw.clone())),
        Operand::NumberKind => {
            if first.raw.eq_ignore_ascii_case("consecutive") {
                Some(DirValue::NumberConsecutive)
            } else {
                Some(DirValue::NumberLiteral(first.raw.to_uppercase()))
            }
        }
        Operand::Rest => unreachable!("handled above"),
    };
    if value.is_some() && one_value {
        if let Some(extra) = words.get(1) {
            errors.push(operand_error(
                "extra_operand",
                key,
                Some(extra),
                key_span,
                format!("Unexpected extra operand: {}", extra.raw),
            ));
        }
    }
    value
}

// ---- QSOの行 ----

/// QSOの行の要素を1つ読む(コールサインは、直後の RST と、間の注釈まで、まとめて読む)
fn qso_items<'a>(conv: &'a Conv<'a>) -> impl FnMut(&'a str) -> Res<'a, Vec<Spanned<QsoItem>>> + 'a {
    let total = conv.line.len();
    move |i| {
        let (i, _) = ws0(i)?;
        let from = total - i.len();

        // 括弧の注釈
        if let Ok((rest, (kind, content, closed))) = comment(i) {
            let item = QsoItem::Comment {
                kind,
                content: content.to_string(),
                closed,
            };
            return Ok((
                rest,
                vec![Spanned {
                    span: conv.span(from, total - rest.len()),
                    node: item,
                }],
            ));
        }

        let (rest, w) = word(i)?;
        let span = conv.span(from, total - rest.len());
        let one = |node: QsoItem| Ok((rest, vec![Spanned { span, node }]));
        match classify(w) {
            Class::Call(call) => call_group(conv, rest, span, call),
            Class::Decimal { digits, value } => one(QsoItem::Time { digits, value }),
            Class::Band { band, freq } => one(QsoItem::Band { band, freq }),
            Class::Freq(f) => one(QsoItem::Freq(f)),
            Class::Mode(m) => one(QsoItem::Mode(m)),
            Class::Wwff(c) => one(QsoItem::Ref {
                kind: RefKind::Wwff,
                code: c,
            }),
            Class::Sota(c) => one(QsoItem::Ref {
                kind: RefKind::Sota,
                code: c,
            }),
            Class::Pota(c) => one(QsoItem::Ref {
                kind: RefKind::Pota,
                code: c,
            }),
            Class::ContestSent(n) => one(QsoItem::ContestSent(n)),
            Class::ContestRcvd(n) => one(QsoItem::ContestRcvd(n)),
            Class::Word(text) => one(QsoItem::Word(text)),
            class => one(QsoItem::Misplaced {
                class,
                text: w.to_string(),
            }),
        }
    }
}

/// コールサインと、その直後の RST(数値か SNR。最大2つ。間の注釈は読み飛ばして、別の要素にする)
fn call_group<'a>(
    conv: &Conv<'_>,
    after_call: &'a str,
    call_span: Span,
    call: String,
) -> Res<'a, Vec<Spanned<QsoItem>>> {
    let total = conv.line.len();
    let mut rest = after_call;
    let mut rst: [Option<Spanned<Rst>>; 2] = [None, None];
    let mut comments: Vec<Spanned<QsoItem>> = Vec::new();

    loop {
        let (i, _) = ws0(rest)?;
        let from = total - i.len();
        if let Ok((r, (kind, content, closed))) = comment(i) {
            let item = QsoItem::Comment {
                kind,
                content: content.to_string(),
                closed,
            };
            comments.push(Spanned {
                span: conv.span(from, total - r.len()),
                node: item,
            });
            rest = r;
            continue;
        }
        if rst[1].is_none() {
            if let Ok((r, w)) = word(i) {
                let parsed = match classify(w) {
                    Class::Decimal { digits, value } => Some(Rst::Digits { digits, value }),
                    Class::Snr(s) => Some(Rst::Snr(s)),
                    _ => None,
                };
                if let Some(node) = parsed {
                    let slot = if rst[0].is_none() { 0 } else { 1 };
                    rst[slot] = Some(Spanned {
                        span: conv.span(from, total - r.len()),
                        node,
                    });
                    rest = r;
                    continue;
                }
            }
        }
        break;
    }
    let [rst_sent, rst_rcvd] = rst;
    let mut items = vec![Spanned {
        span: call_span,
        node: QsoItem::Call {
            call,
            rst_sent,
            rst_rcvd,
        },
    }];
    items.extend(comments);
    Ok((rest, items))
}

fn parse_qso(conv: &Conv) -> LineAst {
    let mut parser = qso_items(conv);
    let mut input = conv.line;
    let mut items: Vec<Spanned<QsoItem>> = Vec::new();
    while let Ok((rest, mut one)) = parser(input) {
        items.append(&mut one);
        input = rest;
    }
    let mut errors = Vec::new();
    for it in &items {
        if let QsoItem::Comment { closed: false, .. } = it.node {
            errors.push(SyntaxError::new(
                "unclosed_comment",
                &[],
                it.span,
                "Unclosed comment.",
            ));
        }
    }
    LineAst {
        kind: LineKind::Qso(items),
        errors,
    }
}

// ---------------------------------------------------------------------------
// 補完: 次に来られるキーワード
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TermKind {
    Command,
    Band,
    Mode,
    Day,
}

/// 次に来られるキーワード
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Term {
    pub text: &'static str,
    pub kind: TermKind,
}

fn commands() -> impl Iterator<Item = Term> {
    DIRECTIVES.iter().map(|d| Term {
        text: d.key,
        kind: TermKind::Command,
    })
}

fn bands() -> impl Iterator<Item = Term> {
    FREQ_TABLE.iter().map(|b| Term {
        text: b.wavelength,
        kind: TermKind::Band,
    })
}

fn modes() -> impl Iterator<Item = Term> {
    MODE_TABLE.keys().map(|m| Term {
        text: m,
        kind: TermKind::Mode,
    })
}

/// `head`(カーソル直前の語を除く、行の先頭からの文字列)のあとに、文法上来られるキーワード。
///
/// 文法の表(指令の表・バンド・モード)から導く。キーワードを足せば、補完にも出る。
/// 行頭は、指令・バンド・モード。指令の値は、その値の文法(`day` は `+` `++`、`number` は `consecutive`)。
/// 設定の行(`40m cw`)は、バンド(周波数)とモードが順不同で、片方があれば、もう片方。
/// それ以外(QSOの行など)は、自由な入力なので、キーワードはない。
pub fn expected_next(head: &str) -> Vec<Term> {
    match parse_line(head).kind {
        LineKind::Blank => commands().chain(bands()).chain(modes()).collect(),
        LineKind::Directive(d) => match (d.spec.operand, d.arg_spans.len()) {
            (Operand::DayStep, 0) => vec![
                Term {
                    text: "+",
                    kind: TermKind::Day,
                },
                Term {
                    text: "++",
                    kind: TermKind::Day,
                },
            ],
            (Operand::NumberKind, 0) => vec![Term {
                text: "consecutive",
                kind: TermKind::Command,
            }],
            _ => Vec::new(),
        },
        LineKind::Qso(items) => {
            // バンド(周波数)とモードは、時刻のあとに順不同で置ける。コールサインのあとに書いても、
            // その行に効く。コールサインのあとは、RST・参照・メッセージの語と区別できないので、
            // 打ち始めてから出す(`min_prefix_len`)。
            let has_call = items.iter().any(|it| matches!(it.node, QsoItem::Call { .. }));
            if !has_call && !before_call(&items) {
                return Vec::new();
            }
            let has_band = items
                .iter()
                .any(|it| matches!(it.node, QsoItem::Band { .. } | QsoItem::Freq(_)));
            let has_mode = items.iter().any(|it| matches!(it.node, QsoItem::Mode(_)));
            let mut out = Vec::new();
            if !has_mode {
                out.extend(modes());
            }
            if !has_band {
                out.extend(bands());
            }
            out
        }
    }
}

/// コールサインより前(時刻・バンド・周波数・モード・注釈だけ)の行か
fn before_call(items: &[Spanned<QsoItem>]) -> bool {
    !items.is_empty()
        && items.iter().all(|it| {
            matches!(
                it.node,
                QsoItem::Time { .. }
                    | QsoItem::Band { .. }
                    | QsoItem::Freq(_)
                    | QsoItem::Mode(_)
                    | QsoItem::Comment { .. }
            )
        })
}

/// 入力中の語が空のとき、候補を出してよいか。
///
/// 設定の行(`40m cw`)は、語が絞られているので、何も打っていなくても出す。
/// 行頭や、時刻のあとのように、次がコールサインかもしれない位置では、語が多く邪魔になるので、
/// 打ち始めてから出す(`prefix_len` 文字以上)。
pub fn min_prefix_len(head: &str) -> usize {
    match parse_line(head).kind {
        LineKind::Blank => 1,
        LineKind::Directive(_) => 0,
        LineKind::Qso(items) => {
            let only_settings = items.iter().all(|it| {
                matches!(
                    it.node,
                    QsoItem::Band { .. }
                        | QsoItem::Freq(_)
                        | QsoItem::Mode(_)
                        | QsoItem::Comment { .. }
                )
            });
            if only_settings {
                0
            } else {
                2
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn items(line: &str) -> Vec<Spanned<QsoItem>> {
        match parse_line(line).kind {
            LineKind::Qso(v) => v,
            other => panic!("QSOの行のはず: {other:?}"),
        }
    }

    fn nodes(line: &str) -> Vec<QsoItem> {
        items(line).into_iter().map(|i| i.node).collect()
    }

    fn dir(line: &str) -> (Option<DirValue>, Vec<SyntaxError>) {
        let ast = parse_line(line);
        match ast.kind {
            LineKind::Directive(d) => (d.value, ast.errors),
            other => panic!("指令のはず: {other:?}"),
        }
    }

    // ---- 語の分類 ----

    #[test]
    fn words_are_classified_in_a_fixed_order() {
        use Class::*;
        let cases: Vec<(&str, Class)> = vec![
            (
                "2026-10-18",
                Date {
                    year: 2026,
                    month: 10,
                    day: 18,
                },
            ),
            (
                "2026/10/18",
                Date {
                    year: 2026,
                    month: 10,
                    day: 18,
                },
            ),
            ("10-18", Date2 { month: 10, day: 18 }),
            ("7.025", Freq("7.025".into())),
            ("-12", Snr("-12".into())),
            ("+9", Snr("+9".into())),
            (
                "40M",
                Band {
                    band: "40m".into(),
                    freq: "7MHz".into(),
                },
            ),
            (
                "70cm",
                Band {
                    band: "70cm".into(),
                    freq: "433MHz".into(),
                },
            ),
            ("jaff-0218", Wwff("JAFF-0218".into())),
            ("ja/tk-001", Sota("JA/TK-001".into())),
            ("jp-0117", Pota("JP-0117".into())),
            ("mysota", Keyword("mysota")),
            ("MyCall", Keyword("mycall")),
            ("cw", Mode("CW".into())),
            ("ft8", Mode("FT8".into())),
            (
                "0900",
                Decimal {
                    digits: 4,
                    value: "0900".into(),
                },
            ),
            (
                "5",
                Decimal {
                    digits: 1,
                    value: "5".into(),
                },
            ),
            ("ja1xyz", Call("JA1XYZ".into())),
            ("7k1abc/1", Call("7K1ABC/1".into())),
            (".001", ContestSent("001".into())),
            (",abc", ContestRcvd("ABC".into())),
            ("my-name", Unknown("MY-NAME".into())),
            ("hello", Word("hello".into())),
            ("Hello", Word("Hello".into())),
            ("+", Word("+".into())),
        ];
        for (w, want) in cases {
            assert_eq!(classify(w), want, "{w}");
        }
    }

    #[test]
    fn the_first_matching_class_wins() {
        // 日付・周波数・SNR は、バンドやコールサインより先
        assert!(matches!(classify("1-2-3"), Class::Date { .. }));
        assert!(matches!(classify("1.5"), Class::Freq(_)));
        assert!(matches!(classify("-5"), Class::Snr(_)));
        // WWFF は、POTA より先(どちらの形にも合う)
        assert!(matches!(classify("JAFF-0001"), Class::Wwff(_)));
        assert!(matches!(classify("JP-0001"), Class::Pota(_)));
        // キーワード・モードは、コールサインより先
        assert!(matches!(classify("date"), Class::Keyword("date")));
        assert!(matches!(classify("ssb"), Class::Mode(_)));
        // 数値は、コールサインより先
        assert!(matches!(classify("73"), Class::Decimal { .. }));
    }

    #[test]
    fn digit_overflow_is_kept_as_max_not_silently_defaulted() {
        assert_eq!(
            classify("99999-1-1"),
            Class::Date {
                year: 99999,
                month: 1,
                day: 1
            }
        );
        assert_eq!(
            classify("2026-99999999999-1"),
            Class::Date {
                year: 2026,
                month: u32::MAX,
                day: 1
            }
        );
    }

    #[test]
    fn full_width_letters_and_digits_are_read_as_half_width() {
        assert_eq!(
            classify("０９００"),
            Class::Decimal {
                digits: 4,
                value: "0900".into()
            }
        );
        assert_eq!(classify("ＪＡ１ＸＹＺ"), Class::Call("JA1XYZ".into()));
        assert_eq!(
            classify("４０ｍ"),
            Class::Band {
                band: "40m".into(),
                freq: "7MHz".into()
            }
        );
        assert_eq!(classify("ｃｗ"), Class::Mode("CW".into()));
    }

    #[test]
    fn consecutive_is_not_a_keyword_by_itself() {
        // `number consecutive` の値としてだけ意味を持つ
        assert_eq!(classify("consecutive"), Class::Word("consecutive".into()));
    }

    #[test]
    fn grids_are_canonicalized() {
        assert_eq!(canonical_grid("pm95UQ").as_deref(), Some("PM95uq"));
        assert_eq!(canonical_grid("PM95").as_deref(), Some("PM95"));
        assert_eq!(canonical_grid("pm95uq12").as_deref(), Some("PM95uq12"));
        for bad in ["XX99", "PM9", "PM95zz", "tokyo", "PM95uq1", ""] {
            assert_eq!(canonical_grid(bad), None, "{bad}");
        }
    }

    // ---- 現行のトークナイザーとの比較(旧実装を消すときに、このテストも消す) ----

    // ---- 空行・注釈 ----

    #[test]
    fn blank_and_comment_only_lines() {
        for l in ["", "   ", "\t", "# 注釈", "  # 注釈", "#"] {
            assert_eq!(parse_line(l).kind, LineKind::Blank, "{l:?}");
        }
    }

    // ---- 指令 ----

    #[test]
    fn directive_values_follow_their_grammar() {
        assert_eq!(
            dir("mycall ja1abc/1").0,
            Some(DirValue::Mycall("JA1ABC/1".into()))
        );
        assert_eq!(
            dir("operator jl1nie").0,
            Some(DirValue::Operator("JL1NIE".into()))
        );
        assert_eq!(
            dir("mysota ja/tk-001").0,
            Some(DirValue::Sota(Some("JA/TK-001".into())))
        );
        assert_eq!(dir("mysota -").0, Some(DirValue::Sota(None)));
        assert_eq!(
            dir("mywwff jaff-0001").0,
            Some(DirValue::Wwff(Some("JAFF-0001".into())))
        );
        assert_eq!(
            dir("mypota jp-0001 jp-0002").0,
            Some(DirValue::Pota(Some(vec![
                "JP-0001".into(),
                "JP-0002".into()
            ])))
        );
        assert_eq!(dir("mypota -").0, Some(DirValue::Pota(None)));
        assert_eq!(
            dir("mygrid pm95UQ").0,
            Some(DirValue::Grid(Some("PM95uq".into())))
        );
        assert_eq!(
            dir("date 2026-10-18").0,
            Some(DirValue::Date(DateValue::Ymd {
                year: 2026,
                month: 10,
                day: 18
            }))
        );
        assert_eq!(
            dir("date 10-18").0,
            Some(DirValue::Date(DateValue::Md { month: 10, day: 18 }))
        );
        assert_eq!(dir("day +").0, Some(DirValue::Day(1)));
        assert_eq!(dir("day ++").0, Some(DirValue::Day(2)));
        assert_eq!(dir("timezone +9").0, Some(DirValue::Timezone(9)));
        assert_eq!(dir("timezone -5").0, Some(DirValue::Timezone(-5)));
        assert_eq!(dir("rigset 2").0, Some(DirValue::Rigset(2)));
        assert_eq!(
            dir("nickname Taro").0,
            Some(DirValue::Nickname("Taro".into()))
        );
        assert_eq!(
            dir("number consecutive").0,
            Some(DirValue::NumberConsecutive)
        );
        assert_eq!(
            dir("number tokyo").0,
            Some(DirValue::NumberLiteral("TOKYO".into()))
        );
        assert_eq!(
            dir("qslmsg tnx  for   the qso").0,
            Some(DirValue::Qslmsg("tnx for the qso".into()))
        );
        assert_eq!(
            dir("qslmsg2 second").0,
            Some(DirValue::Qslmsg2("second".into()))
        );
    }

    #[test]
    fn directives_may_be_tab_separated_and_have_trailing_comments() {
        assert_eq!(
            dir("mycall\tJA1ABC").0,
            Some(DirValue::Mycall("JA1ABC".into()))
        );
        assert_eq!(
            dir("mycall JA1ABC # 注釈").0,
            Some(DirValue::Mycall("JA1ABC".into()))
        );
        assert!(
            dir("mycall JA1ABC {自局}").1.is_empty(),
            "注釈は、余分な値ではない"
        );
    }

    #[test]
    fn missing_operands_keep_the_legacy_messages() {
        let msg = |l: &str| dir(l).1.first().map(|e| (e.code, e.message.clone()));
        assert_eq!(
            msg("mycall"),
            Some(("missing_operand", "Missing operand.".into()))
        );
        assert_eq!(
            msg("mysota"),
            Some(("missing_operand", "Missing SOTA ref#.".into()))
        );
        assert_eq!(
            msg("mywwff"),
            Some(("missing_operand", "Missing WWFF ref#.".into()))
        );
        assert_eq!(
            msg("mypota"),
            Some(("missing_operand", "Missing POTA ref#.".into()))
        );
        assert_eq!(
            msg("mygrid"),
            Some(("missing_operand", "Missing grid locator.".into()))
        );
        assert_eq!(
            msg("day"),
            Some(("missing_operand", "Missing operand +/++.".into()))
        );
        assert_eq!(
            msg("timezone"),
            Some(("missing_operand", "Missing timezone. (eg. +9)".into()))
        );
        assert_eq!(
            msg("qslmsg"),
            Some(("missing_operand", "Missing operand.".into()))
        );
    }

    #[test]
    fn invalid_operands_are_reported_with_code_args_and_span() {
        let (value, errors) = dir("mysota xx");
        assert_eq!(value, None);
        assert_eq!(errors.len(), 1);
        let e = &errors[0];
        assert_eq!(
            (e.code, e.args.clone(), e.span, e.message.as_str()),
            (
                "invalid_operand",
                vec!["mysota".to_string(), "xx".to_string()],
                (7, 9),
                "xx is invalid SOTA ref#."
            )
        );
        assert_eq!(dir("mycall hello").1[0].message, "Invalid callsign.");
        assert_eq!(dir("operator ???").1[0].message, "Invalid operator.");
        assert_eq!(dir("date hello").1[0].message, "Wrong date format.");
        assert_eq!(dir("timezone 9").1[0].message, "9 is invalid timezone.");
        assert_eq!(dir("rigset x").1[0].message, "Invalid Rig set#.");
        assert_eq!(dir("rigset 999").1[0].message, "Invalid Rig set#.");
        assert_eq!(dir("day x").1[0].code, "unknown_operand");
        assert_eq!(
            dir("mygrid XX99").1[0].message,
            "XX99 is invalid grid locator."
        );
    }

    #[test]
    fn extra_operands_are_errors() {
        let (value, errors) = dir("mycall JA1ABC extra");
        assert_eq!(
            value,
            Some(DirValue::Mycall("JA1ABC".into())),
            "値は読めるが、余分な値は誤り"
        );
        assert_eq!(
            (errors[0].code, errors[0].span, errors[0].args.clone()),
            (
                "extra_operand",
                (14, 19),
                vec!["mycall".to_string(), "extra".to_string()]
            )
        );
        assert_eq!(dir("date 2026-10-18 xyz").1[0].code, "extra_operand");
        assert_eq!(dir("timezone +9 x").1[0].code, "extra_operand");
        assert_eq!(dir("mypota - JP-0001").1[0].code, "extra_operand");
        assert!(
            dir("mypota JP-0001 JP-0002").1.is_empty(),
            "公園は、並べるもの"
        );
        assert!(dir("qslmsg many words here").1.is_empty(), "行の残りは、値");
    }

    #[test]
    fn a_bad_pota_list_keeps_nothing() {
        let (value, errors) = dir("mypota JP-0001 nonsense JP-0002");
        assert_eq!(value, None);
        assert_eq!(errors[0].message, "nonsense is invalid POTA ref#.");
    }

    // ---- QSOの行 ----

    #[test]
    fn a_qso_line_is_a_sequence_of_items() {
        use QsoItem::*;
        assert_eq!(
            nodes("0900 40m cw ja1xyz ja/tk-001 {tokyo}"),
            vec![
                Time {
                    digits: 4,
                    value: "0900".into()
                },
                Band {
                    band: "40m".into(),
                    freq: "7MHz".into()
                },
                Mode("CW".into()),
                Call {
                    call: "JA1XYZ".into(),
                    rst_sent: None,
                    rst_rcvd: None
                },
                Ref {
                    kind: RefKind::Sota,
                    code: "JA/TK-001".into()
                },
                Comment {
                    kind: CommentKind::Curly,
                    content: "tokyo".into(),
                    closed: true
                },
            ]
        );
    }

    #[test]
    fn rst_belongs_to_the_callsign_right_before_it() {
        let it = nodes("0900 ja1xyz 579 449 ja/tk-001");
        match &it[1] {
            QsoItem::Call {
                rst_sent, rst_rcvd, ..
            } => {
                assert_eq!(
                    rst_sent.as_ref().map(|r| r.node.clone()),
                    Some(Rst::Digits {
                        digits: 3,
                        value: "579".into()
                    })
                );
                assert_eq!(
                    rst_rcvd.as_ref().map(|r| r.node.clone()),
                    Some(Rst::Digits {
                        digits: 3,
                        value: "449".into()
                    })
                );
                assert_eq!(rst_sent.as_ref().unwrap().span, (12, 15));
                assert_eq!(rst_rcvd.as_ref().unwrap().span, (16, 19));
            }
            other => panic!("{other:?}"),
        }
        assert!(matches!(it[2], QsoItem::Ref { .. }));
    }

    #[test]
    fn at_most_two_numbers_follow_the_callsign_as_rst_and_the_rest_are_times() {
        let it = nodes("ja1xyz 599 579 0910");
        assert!(matches!(
            &it[0],
            QsoItem::Call {
                rst_sent: Some(_),
                rst_rcvd: Some(_),
                ..
            }
        ));
        assert_eq!(
            it[1],
            QsoItem::Time {
                digits: 4,
                value: "0910".into()
            }
        );
    }

    #[test]
    fn snr_is_a_valid_rst_and_a_lone_snr_is_misplaced() {
        assert!(matches!(
            &nodes("ja1xyz -12 +03")[0],
            QsoItem::Call {
                rst_sent: Some(Spanned {
                    node: Rst::Snr(_),
                    ..
                }),
                rst_rcvd: Some(_),
                ..
            }
        ));
        let it = nodes("ja1xyz 599 579 -10");
        assert!(matches!(
            &it[1],
            QsoItem::Misplaced {
                class: Class::Snr(_),
                ..
            }
        ));
    }

    #[test]
    fn comments_between_the_callsign_and_rst_are_skipped_not_lost() {
        let it = nodes("ja1xyz <hi> 5 7");
        assert!(matches!(
            &it[0],
            QsoItem::Call {
                rst_sent: Some(_),
                rst_rcvd: Some(_),
                ..
            }
        ));
        assert!(matches!(
            &it[1],
            QsoItem::Comment {
                kind: CommentKind::Angle,
                ..
            }
        ));
        assert_eq!(it.len(), 2);
    }

    #[test]
    fn a_non_number_right_after_the_callsign_ends_the_rst() {
        let it = nodes("ja1xyz hello 599");
        assert!(matches!(
            &it[0],
            QsoItem::Call {
                rst_sent: None,
                rst_rcvd: None,
                ..
            }
        ));
        assert_eq!(it[1], QsoItem::Word("hello".into()));
        assert_eq!(
            it[2],
            QsoItem::Time {
                digits: 3,
                value: "599".into()
            }
        );
    }

    #[test]
    fn misplaced_words_are_kept_for_the_evaluator_to_report() {
        let it = nodes("0900 ja1xyz date 2026-10-19 my-name");
        let kinds: Vec<_> = it
            .iter()
            .skip(2)
            .map(|i| match i {
                QsoItem::Misplaced { class, .. } => class.clone(),
                other => panic!("{other:?}"),
            })
            .collect();
        assert_eq!(kinds.len(), 3);
        assert!(matches!(kinds[0], Class::Keyword("date")));
        assert!(matches!(kinds[1], Class::Date { .. }));
        assert!(matches!(kinds[2], Class::Unknown(_)));
    }

    #[test]
    fn plain_words_keep_their_case_and_order() {
        assert_eq!(
            nodes("ja1xyz Hello World foo"),
            vec![
                QsoItem::Call {
                    call: "JA1XYZ".into(),
                    rst_sent: None,
                    rst_rcvd: None
                },
                QsoItem::Word("Hello".into()),
                QsoItem::Word("World".into()),
                QsoItem::Word("foo".into()),
            ]
        );
    }

    #[test]
    fn an_unclosed_comment_reaches_the_end_of_the_line_and_is_an_error() {
        let ast = parse_line("ja1xyz {abc 599");
        assert_eq!(ast.errors.len(), 1);
        assert_eq!(
            (ast.errors[0].code, ast.errors[0].span),
            ("unclosed_comment", (7, 15))
        );
        let LineKind::Qso(items) = ast.kind else {
            panic!()
        };
        assert_eq!(
            items.last().unwrap().node,
            QsoItem::Comment {
                kind: CommentKind::Curly,
                content: "abc 599".into(),
                closed: false
            }
        );
    }

    #[test]
    fn a_hash_ends_the_line_and_splits_a_word() {
        assert_eq!(nodes("ja1xyz # 注釈 40m").len(), 1);
        assert_eq!(nodes("ja1xyz#foo").len(), 1);
    }

    #[test]
    fn any_whitespace_separates_items() {
        for sep in ["\t", " ", "\u{3000}", "\u{00a0}", " \t "] {
            assert_eq!(
                nodes(&format!("0900{sep}ja1xyz{sep}599")).len(),
                2,
                "{sep:?}"
            );
        }
    }

    // ---- 位置(UTF-16) ----

    #[test]
    fn spans_are_utf16_positions_within_the_line() {
        let it = items("0900 ja1xyz <曽田さん> {島根市} jp-0001");
        let spans: Vec<Span> = it.iter().map(|i| i.span).collect();
        // 日本語は1文字 = 1単位
        assert_eq!(spans, vec![(0, 4), (5, 11), (12, 18), (19, 24), (25, 32)]);
    }

    #[test]
    fn spans_count_surrogate_pairs_as_two_units() {
        let it = items("😀 ja1xyz");
        assert_eq!(it[0].span, (0, 2));
        assert_eq!(it[1].span, (3, 9));
    }

    #[test]
    fn spans_across_mixed_whitespace() {
        let it = items("0900\tja1xyz\u{3000}599");
        let spans: Vec<Span> = it.iter().map(|i| i.span).collect();
        assert_eq!(spans, vec![(0, 4), (5, 11)]);
    }

    #[test]
    fn directive_spans() {
        let LineKind::Directive(d) = parse_line("  mysota JA/TK-001").kind else {
            panic!()
        };
        assert_eq!(d.key_span, (2, 8));
        assert_eq!(d.arg_spans, vec![(9, 18)]);
    }

    // ---- 補完: 次に来られるキーワード ----

    fn texts(head: &str) -> Vec<&'static str> {
        expected_next(head).into_iter().map(|t| t.text).collect()
    }

    #[test]
    fn a_blank_line_expects_commands_bands_and_modes() {
        let t = expected_next("");
        assert!(t
            .iter()
            .any(|x| x.text == "mysota" && x.kind == TermKind::Command));
        assert!(t
            .iter()
            .any(|x| x.text == "40m" && x.kind == TermKind::Band));
        assert!(t
            .iter()
            .any(|x| x.text == "ssb" && x.kind == TermKind::Mode));
        assert_eq!(expected_next("   ").len(), t.len());
    }

    #[test]
    fn the_commands_come_from_the_directive_table() {
        let t: Vec<_> = expected_next("")
            .into_iter()
            .filter(|x| x.kind == TermKind::Command)
            .map(|x| x.text)
            .collect();
        assert_eq!(t.len(), DIRECTIVES.len());
        assert!(!t.contains(&"consecutive"), "consecutive は `number` の値");
    }

    #[test]
    fn operands_expect_what_their_grammar_allows() {
        assert_eq!(texts("day"), vec!["+", "++"]);
        assert_eq!(texts("day +"), Vec::<&str>::new());
        assert_eq!(texts("number"), vec!["consecutive"]);
        assert!(texts("mysota").is_empty());
        assert!(texts("mycall").is_empty());
    }

    #[test]
    fn a_setting_line_expects_the_other_half() {
        let after_band = expected_next("40m");
        assert!(after_band.iter().all(|t| t.kind == TermKind::Mode) && !after_band.is_empty());
        let after_mode = expected_next("cw");
        assert!(after_mode.iter().all(|t| t.kind == TermKind::Band) && !after_mode.is_empty());
        assert!(expected_next("40m cw").is_empty());
        assert!(expected_next("7.025 cw").is_empty());
        assert!(expected_next("7.025")
            .iter()
            .all(|t| t.kind == TermKind::Mode));
    }

    #[test]
    fn a_qso_line_expects_band_and_mode_only() {
        // コールサインのあとも、その行にないバンド・モードだけ(指令のキーワードは出ない)
        assert!(expected_next("0900 ja1xyz")
            .iter()
            .all(|t| matches!(t.kind, TermKind::Band | TermKind::Mode)));
        assert!(expected_next("0900 ja1xyz 40m cw").is_empty());
        assert!(
            !expected_next("0900").is_empty(),
            "時刻のあとは、バンドとモード"
        );
        assert!(expected_next("0900 40m")
            .iter()
            .all(|t| t.kind == TermKind::Mode));
        assert!(expected_next("0900 40m cw").is_empty());
        assert_eq!(min_prefix_len(""), 1);
        assert_eq!(min_prefix_len("40m"), 0);
        assert_eq!(min_prefix_len("0900"), 2);
        assert_eq!(min_prefix_len("day"), 0);
    }
}

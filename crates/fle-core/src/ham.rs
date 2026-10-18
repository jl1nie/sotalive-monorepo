//! Common types for log conversion

use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Frequency band information
#[derive(Debug, Clone)]
pub struct BandInfo {
    pub lower: f64,
    pub upper: f64,
    pub band_air: &'static str,
    pub band_sota: &'static str,
    pub wavelength: &'static str,
}

/// Frequency to band conversion table
pub static FREQ_TABLE: Lazy<Vec<BandInfo>> = Lazy::new(|| {
    vec![
        BandInfo {
            lower: 0.1357,
            upper: 0.1378,
            band_air: "135kHz",
            band_sota: "VLF",
            wavelength: "2190m",
        },
        BandInfo {
            lower: 0.472,
            upper: 0.479,
            band_air: "475kHz",
            band_sota: "VLF",
            wavelength: "630m",
        },
        BandInfo {
            lower: 1.8,
            upper: 1.9125,
            band_air: "1.9MHz",
            band_sota: "1.8MHz",
            wavelength: "160m",
        },
        BandInfo {
            lower: 3.5,
            upper: 3.805,
            band_air: "3.8MHz",
            band_sota: "3.5MHz",
            wavelength: "80m",
        },
        BandInfo {
            lower: 7.0,
            upper: 7.2,
            band_air: "7MHz",
            band_sota: "7MHz",
            wavelength: "40m",
        },
        BandInfo {
            lower: 10.0,
            upper: 10.150,
            band_air: "10MHz",
            band_sota: "10MHz",
            wavelength: "30m",
        },
        BandInfo {
            lower: 14.0,
            upper: 14.350,
            band_air: "14MHz",
            band_sota: "14MHz",
            wavelength: "20m",
        },
        BandInfo {
            lower: 18.0,
            upper: 18.168,
            band_air: "18MHz",
            band_sota: "18MHz",
            wavelength: "17m",
        },
        BandInfo {
            lower: 21.0,
            upper: 21.450,
            band_air: "21MHz",
            band_sota: "21MHz",
            wavelength: "15m",
        },
        BandInfo {
            lower: 24.0,
            upper: 24.990,
            band_air: "24MHz",
            band_sota: "24MHz",
            wavelength: "12m",
        },
        BandInfo {
            lower: 28.0,
            upper: 29.7,
            band_air: "28MHz",
            band_sota: "28MHz",
            wavelength: "10m",
        },
        BandInfo {
            lower: 50.0,
            upper: 54.0,
            band_air: "50MHz",
            band_sota: "50MHz",
            wavelength: "6m",
        },
        BandInfo {
            lower: 144.0,
            upper: 146.0,
            band_air: "144MHz",
            band_sota: "144MHz",
            wavelength: "2m",
        },
        BandInfo {
            lower: 430.0,
            upper: 440.0,
            band_air: "430MHz",
            band_sota: "433MHz",
            wavelength: "70cm",
        },
        BandInfo {
            lower: 1200.0,
            upper: 1300.0,
            band_air: "1200MHz",
            band_sota: "1290MHz",
            wavelength: "23cm",
        },
        BandInfo {
            lower: 2400.0,
            upper: 2450.0,
            band_air: "2400MHz",
            band_sota: "2.3GHz",
            wavelength: "13cm",
        },
        BandInfo {
            lower: 5650.0,
            upper: 5850.0,
            band_air: "5600MHz",
            band_sota: "5.6GHz",
            wavelength: "6cm",
        },
        BandInfo {
            lower: 10000.0,
            upper: 10250.0,
            band_air: "10.1GHz",
            band_sota: "10GHz",
            wavelength: "3cm",
        },
        BandInfo {
            lower: 10450.0,
            upper: 10500.0,
            band_air: "10.4GHz",
            band_sota: "10GHz",
            wavelength: "3cm",
        },
        // Non-amateur bands (Japanese specific)
        BandInfo {
            lower: 351.0,
            upper: 351.38125,
            band_air: "デジタル簡易(351MHz)",
            band_sota: "",
            wavelength: "",
        },
        BandInfo {
            lower: 421.0,
            upper: 454.19375,
            band_air: "特定小電力(422MHz)",
            band_sota: "",
            wavelength: "",
        },
        BandInfo {
            lower: 26.968,
            upper: 27.144,
            band_air: "CB(27MHz)",
            band_sota: "",
            wavelength: "",
        },
        BandInfo {
            lower: 142.0,
            upper: 147.0,
            band_air: "デジタル小電力コミュニティ(142/146MHz)",
            band_sota: "",
            wavelength: "",
        },
    ]
});

/// JA region code to area number mapping
pub static JA_REGION_TABLE: Lazy<HashMap<&'static str, &'static str>> = Lazy::new(|| {
    let mut m = HashMap::new();
    // Area 0
    m.insert("JA/NI", "0");
    m.insert("JA/NN", "0");
    // Area 1
    m.insert("JA/TK", "1");
    m.insert("JA/KN", "1");
    m.insert("JA/CB", "1");
    m.insert("JA/ST", "1");
    m.insert("JA/IB", "1");
    m.insert("JA/TG", "1");
    m.insert("JA/GM", "1");
    m.insert("JA/YN", "1");
    // Area 2
    m.insert("JA/SO", "2");
    m.insert("JA/GF", "2");
    m.insert("JA/AC", "2");
    m.insert("JA/ME", "2");
    // Area 3
    m.insert("JA/KT", "3");
    m.insert("JA/SI", "3");
    m.insert("JA/NR", "3");
    m.insert("JA/OS", "3");
    m.insert("JA/WK", "3");
    m.insert("JA/HG", "3");
    // Area 4
    m.insert("JA/OY", "4");
    m.insert("JA/SN", "4");
    m.insert("JA/YG", "4");
    m.insert("JA/TT", "4");
    m.insert("JA/HS", "4");
    // Area 5
    m.insert("JA5/KA", "5");
    m.insert("JA5/TS", "5");
    m.insert("JA5/EH", "5");
    m.insert("JA5/KC", "5");
    // Area 6
    m.insert("JA6/FO", "6");
    m.insert("JA6/SG", "6");
    m.insert("JA6/NS", "6");
    m.insert("JA6/KM", "6");
    m.insert("JA6/OT", "6");
    m.insert("JA6/MZ", "6");
    m.insert("JA6/KG", "6");
    m.insert("JA6/ON", "6");
    // Area 7
    m.insert("JA/AM", "7");
    m.insert("JA/IT", "7");
    m.insert("JA/AT", "7");
    m.insert("JA/YM", "7");
    m.insert("JA/MG", "7");
    m.insert("JA/FS", "7");
    // Area 8
    m.insert("JA8/SY", "8");
    m.insert("JA8/RM", "8");
    m.insert("JA8/KK", "8");
    m.insert("JA8/OH", "8");
    m.insert("JA8/SC", "8");
    m.insert("JA8/IS", "8");
    m.insert("JA8/NM", "8");
    m.insert("JA8/SB", "8");
    m.insert("JA8/TC", "8");
    m.insert("JA8/KR", "8");
    m.insert("JA8/HD", "8");
    m.insert("JA8/IR", "8");
    m.insert("JA8/HY", "8");
    m.insert("JA8/OM", "8");
    // Area 9
    m.insert("JA/TY", "9");
    m.insert("JA/FI", "9");
    m.insert("JA/IK", "9");
    m
});

/// SOTA mode conversion patterns
pub static SOTA_MODE_TABLE: Lazy<Vec<(&'static str, Vec<&'static str>)>> = Lazy::new(|| {
    vec![
        ("CW", vec!["CW"]),
        ("SSB", vec!["SSB"]),
        ("FM", vec!["FM"]),
        ("AM", vec!["AM"]),
        (
            "DATA",
            vec![
                "RTTY", "RTY", "PSK", "PSK31", "PSK-31", "DIG", "DATA", "JT9", "JT65", "FT8",
                "FT4", "FSQ",
            ],
        ),
        ("DV", vec!["DV", "FUSION", "DSTAR", "D-STAR", "DMR", "C4FM"]),
    ]
});

/// ADIF mode normalization patterns
pub static ADIF_NORMALIZE: Lazy<Vec<(&'static str, Vec<&'static str>)>> = Lazy::new(|| {
    vec![
        ("DIGITALVOICE", vec!["DV"]),
        ("DSTAR", vec!["D-STAR", "FUSION"]),
    ]
});

/// ADIF mode/submode mapping
pub static ADIF_MODE_TABLE: Lazy<Vec<(&'static str, Vec<&'static str>)>> = Lazy::new(|| {
    vec![
        (
            "MFSK",
            vec![
                "FSQCALL", "FST4", "FST4W", "FT4", "JS8", "JTMS", "MFSK4", "MFSK8", "MFSK11",
                "MFSK16", "MFSK22", "MFSK31", "MFSK32", "MFSK64", "MFSK64L", "MFSK128", "MFSK128L",
                "Q65",
            ],
        ),
        (
            "DIGITALVOICE",
            vec!["C4FM", "DMR", "DSTAR", "FREEDV", "M17"],
        ),
    ]
});

/// Parsed QSO record (common format for all input types)
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct QsoRecord {
    pub has_error: bool,
    pub error_message: String,
    pub date_error: String,
    pub time_error: String,
    pub band_error: String,

    pub callsign: String,
    pub operator: String,
    pub portable: String,
    pub iso_time: String,
    pub year: i32,
    pub month: u32,
    pub day: u32,
    pub hour: u32,
    pub minute: u32,
    pub timezone: String,
    pub rst_sent: String,
    pub rst_rcvd: String,
    pub freq: String,
    pub band: String,
    pub band_sota: String,
    pub band_wlen: String,
    pub mode: String,
    pub sub_mode: String,
    pub mode_airham: String,
    pub mode_sota: String,
    pub code: String,
    pub gridsquare: String,
    pub qsl: String,
    pub qsl_sent: i32,
    pub qsl_rcvd: i32,
    pub name: String,
    pub qth: String,
    pub remarks1: String,
    pub remarks2: String,
}

/// Reference information extracted from remarks
#[derive(Debug, Clone, Default)]
pub struct RefInfo {
    pub sota: String,
    pub portable: String,
    pub wwff: Vec<String>,
    pub pota: Vec<String>,
    pub loc: String,
    pub loc_org: String,
    pub sat: String,
    pub sat_oscar: String,
    pub sat_org: String,
    pub sat_down: String,
    pub org: String,
}

/// Conversion options
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ConversionOptions {
    /// Source of my QTH (rmks1, rmks2, user_defined)
    pub my_qth: String,
    /// Source of his QTH (rmks1, rmks2, qth, none)
    pub his_qth: String,
    /// User-defined location
    pub location: String,
    /// Summit reference for SOTA
    pub summit: String,
    /// Park references for POTA
    pub park: Vec<String>,
    /// SOTA activator callsign
    pub sota_activator: String,
    /// POTA activator callsign
    pub pota_activator: String,
    /// POTA operator callsign
    pub pota_operator: String,
    /// WWFF activator callsign
    pub wwff_activator: String,
    /// WWFF operator callsign
    pub wwff_operator: String,
    /// WWFF reference
    pub wwff_ref: String,
}

/// Conversion result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversionResult {
    pub status: String,
    pub error_log: Vec<String>,
    pub log_text: Vec<Vec<String>>,
    pub file_list: Vec<String>,
    pub files: HashMap<String, String>,
}

impl Default for ConversionResult {
    fn default() -> Self {
        Self {
            status: "OK".to_string(),
            error_log: Vec::new(),
            log_text: Vec::new(),
            file_list: Vec::new(),
            files: HashMap::new(),
        }
    }
}

/// Convert frequency string to band info
pub fn freq_to_band(freq_str: &str) -> Result<(&'static str, &'static str, &'static str), String> {
    // Handle "freq1/freq2" format - use first frequency
    let freq_str = if let Some(idx) = freq_str.find('/') {
        &freq_str[..idx]
    } else {
        freq_str
    };

    let freq: f64 = freq_str.parse().unwrap_or(0.0);

    for band in FREQ_TABLE.iter() {
        if freq >= band.lower && freq <= band.upper {
            return Ok((band.band_air, band.band_sota, band.wavelength));
        }
    }

    Err(format!("Unknown frequency: {}", freq_str))
}

/// Convert band string to frequency
pub fn band_to_freq(band_str: &str, is_sota: bool) -> Option<&'static str> {
    let band_upper = band_str.to_uppercase();
    for band in FREQ_TABLE.iter() {
        if band.wavelength.to_uppercase() == band_upper {
            return Some(if is_sota {
                band.band_sota
            } else {
                band.band_air
            });
        }
    }
    None
}

/// Convert mode to SOTA mode
pub fn mode_to_sota_mode(mode: &str) -> &'static str {
    let mode_upper = mode.to_uppercase();
    for (sota_mode, patterns) in SOTA_MODE_TABLE.iter() {
        if patterns.iter().any(|p| p.to_uppercase() == mode_upper) {
            return sota_mode;
        }
    }
    "OTHER"
}

/// Convert mode to ADIF mode/submode
pub fn mode_to_adif_mode(mode: &str) -> (String, String) {
    let mut smode = mode.to_uppercase();

    // Normalize first
    for (normalized, patterns) in ADIF_NORMALIZE.iter() {
        if patterns.iter().any(|p| p.to_uppercase() == smode) {
            smode = normalized.to_string();
            break;
        }
    }

    // Find mode/submode
    for (adif_mode, patterns) in ADIF_MODE_TABLE.iter() {
        if patterns.iter().any(|p| p.to_uppercase() == smode) {
            return (adif_mode.to_string(), smode);
        }
    }

    (smode, String::new())
}

/// Convert mode to AirHam mode (handles SSB -> LSB/USB based on frequency)
pub fn mode_to_airham_mode(mode: &str, freq_str: &str) -> String {
    let freq: f64 = freq_str.parse().unwrap_or(0.0);
    let mode_upper = mode.to_uppercase();

    if mode_upper == "SSB" {
        if freq <= 7.2 {
            "SSB(LSB)".to_string()
        } else {
            "SSB(USB)".to_string()
        }
    } else {
        mode_upper
    }
}

/// Split callsign into operator and portable parts
pub fn split_callsign(call: &str) -> (String, String) {
    let call = call.to_uppercase();

    // Pattern: PREFIX/CALL/SUFFIX (e.g., JA/JL1NIE/P)
    let parts: Vec<&str> = call.split('/').collect();

    match parts.len() {
        3 => {
            // Check if middle part starts with digit
            if parts[1]
                .chars()
                .next()
                .map(|c| c.is_ascii_digit())
                .unwrap_or(false)
            {
                // Pattern like JL1NIE/7/P
                (parts[0].to_string(), format!("{}/{}", parts[1], parts[2]))
            } else {
                // Pattern like JA/JL1NIE/P
                (parts[1].to_string(), parts[0].to_string())
            }
        }
        2 => {
            let first_char = parts[1].chars().next();
            if first_char.map(|c| c.is_ascii_digit()).unwrap_or(false) {
                // Pattern like JL1NIE/7
                (parts[0].to_string(), parts[1].to_string())
            } else if parts[1].to_uppercase() == "QRP" {
                (parts[0].to_string(), parts[1].to_string())
            } else if parts[1].len() > parts[0].len() {
                // PREFIX/CALL
                (parts[1].to_string(), parts[0].to_string())
            } else {
                // CALL/SUFFIX
                (parts[0].to_string(), parts[1].to_string())
            }
        }
        _ => (call.trim().to_string(), String::new()),
    }
}

/// Cached regex patterns for get_ref function
static COORD_RE: Lazy<regex::Regex> =
    Lazy::new(|| regex::Regex::new(r"(-?\d+(\.\d+)?[nsNS]?\s*,\s*-?\d+(\.\d+)?[ewEW]?)").unwrap());
static WWFF_RE: Lazy<regex::Regex> =
    Lazy::new(|| regex::Regex::new(r"(?i)([A-Z0-9]+FF-\d+)").unwrap());
static POTA_RE: Lazy<regex::Regex> =
    Lazy::new(|| regex::Regex::new(r"([a-zA-Z0-9]+-\d{4})").unwrap());
static SOTA_RE: Lazy<regex::Regex> =
    Lazy::new(|| regex::Regex::new(r"(([a-zA-Z0-9]+/[a-zA-Z0-9]+)-\d+)").unwrap());
static GRID_RE: Lazy<regex::Regex> =
    Lazy::new(|| regex::Regex::new(r"([a-zA-Z]{2}\d{2}[a-zA-Z]{2})").unwrap());
static SAT_RE: Lazy<regex::Regex> =
    Lazy::new(|| regex::Regex::new(r"(([a-zA-Z]+-\d+)/([a-zA-Z]+/(\w+)))").unwrap());

/// Extract reference information from a string
pub fn get_ref(s: &str) -> RefInfo {
    let mut info = RefInfo::default();

    // Check for lat/lon coordinates
    if let Some(caps) = COORD_RE.captures(s) {
        info.loc = format!("%QTH%{}% ", &caps[1]);
    }

    // Split by comma or whitespace
    let parts: Vec<&str> = s.split(|c: char| c == ',' || c.is_whitespace()).collect();

    for part in parts {
        let part = part.trim();
        if part.is_empty() {
            continue;
        }

        // WWFF reference (e.g., JAFF-0001)
        if let Some(caps) = WWFF_RE.captures(part) {
            info.wwff.push(caps[1].to_uppercase());
            continue;
        }

        // POTA reference (e.g., JA-0001)
        if let Some(caps) = POTA_RE.captures(part) {
            info.pota.push(caps[1].to_uppercase());
            continue;
        }

        // SOTA reference (e.g., JA/TK-001)
        if let Some(caps) = SOTA_RE.captures(part) {
            info.sota = caps[1].to_uppercase();
            let prefix = caps[2].to_uppercase();
            if let Some(area) = JA_REGION_TABLE.get(prefix.as_str()) {
                info.portable = area.to_string();
            } else {
                info.portable = "P".to_string();
            }
            continue;
        }

        // Grid locator (e.g., PM95vq)
        if let Some(caps) = GRID_RE.captures(part) {
            info.loc = format!("%QRA%{}% ", &caps[1]);
            info.loc_org = caps[1].to_string();
            continue;
        }

        // Satellite reference
        if let Some(caps) = SAT_RE.captures(part) {
            info.sat = format!("%SAT%{}%,{}", caps[2].to_uppercase(), &caps[3]);
            info.sat_oscar = caps[2].to_uppercase();
            info.sat_org = caps[1].to_string();
            info.sat_down = caps[4].to_string();
            continue;
        }

        // Unrecognized - add to org
        if !info.org.is_empty() {
            info.org.push(' ');
        }
        info.org.push_str(part);
    }

    info
}

/// Format ADIF field
pub fn adif_field(key: &str, value: &str) -> String {
    if value.is_empty() {
        return String::new();
    }

    let field_name = match key {
        "activator" => "STATION_CALLSIGN",
        "callsign" => "CALL",
        "date" => "QSO_DATE",
        "time" => "TIME_ON",
        "band-wlen" => "BAND",
        "mode" => "MODE",
        "sub_mode" => "SUBMODE",
        "rst_sent" => "RST_SENT",
        "rst_rcvd" => "RST_RCVD",
        "mysig" => "MY_SIG",
        "mysiginfo" => "MY_SIG_INFO",
        "mystate" => "MY_STATE",
        "sig" => "SIG",
        "siginfo" => "SIG_INFO",
        "sotaref" => "SOTA_REF",
        "mysotaref" => "MY_SOTA_REF",
        "operator" => "OPERATOR",
        "programid" => "PROGRAMID",
        "adifver" => "ADIF_VER",
        _ => "COMMENT",
    };

    format!("<{}:{}>{}", field_name, value.len(), value)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_freq_to_band() {
        let (air, sota, wlen) = freq_to_band("7.025").unwrap();
        assert_eq!(air, "7MHz");
        assert_eq!(sota, "7MHz");
        assert_eq!(wlen, "40m");

        let (air, sota, wlen) = freq_to_band("14.230").unwrap();
        assert_eq!(air, "14MHz");
        assert_eq!(sota, "14MHz");
        assert_eq!(wlen, "20m");

        let (air, _, _) = freq_to_band("144.500").unwrap();
        assert_eq!(air, "144MHz");

        assert!(freq_to_band("999.999").is_err());
    }

    #[test]
    fn test_split_callsign() {
        assert_eq!(
            split_callsign("JL1NIE"),
            ("JL1NIE".to_string(), String::new())
        );
        assert_eq!(
            split_callsign("JL1NIE/7"),
            ("JL1NIE".to_string(), "7".to_string())
        );
        assert_eq!(
            split_callsign("JA/JL1NIE"),
            ("JL1NIE".to_string(), "JA".to_string())
        );
        assert_eq!(
            split_callsign("JL1NIE/QRP"),
            ("JL1NIE".to_string(), "QRP".to_string())
        );
    }

    #[test]
    fn test_mode_to_sota_mode() {
        assert_eq!(mode_to_sota_mode("CW"), "CW");
        assert_eq!(mode_to_sota_mode("ssb"), "SSB");
        assert_eq!(mode_to_sota_mode("FT8"), "DATA");
        assert_eq!(mode_to_sota_mode("D-STAR"), "DV");
        assert_eq!(mode_to_sota_mode("UNKNOWN"), "OTHER");
    }

    #[test]
    fn test_mode_to_adif_mode() {
        assert_eq!(mode_to_adif_mode("CW"), ("CW".to_string(), String::new()));
        assert_eq!(
            mode_to_adif_mode("FT4"),
            ("MFSK".to_string(), "FT4".to_string())
        );
        assert_eq!(
            mode_to_adif_mode("C4FM"),
            ("DIGITALVOICE".to_string(), "C4FM".to_string())
        );
    }

    #[test]
    fn test_mode_to_airham_mode() {
        assert_eq!(mode_to_airham_mode("SSB", "7.1"), "SSB(LSB)");
        assert_eq!(mode_to_airham_mode("SSB", "14.2"), "SSB(USB)");
        assert_eq!(mode_to_airham_mode("CW", "7.0"), "CW");
    }

    #[test]
    fn test_get_ref() {
        let info = get_ref("JA/TK-001");
        assert_eq!(info.sota, "JA/TK-001");
        assert_eq!(info.portable, "1");

        let info = get_ref("JAFF-0001");
        assert_eq!(info.wwff, vec!["JAFF-0001"]);

        let info = get_ref("JA-0001");
        assert_eq!(info.pota, vec!["JA-0001"]);

        let info = get_ref("PM95vq");
        assert!(info.loc.contains("PM95vq"));
        assert_eq!(info.loc_org, "PM95vq");
    }

    #[test]
    fn test_adif_field() {
        assert_eq!(adif_field("callsign", "JL1NIE"), "<CALL:6>JL1NIE");
        assert_eq!(adif_field("date", "20241228"), "<QSO_DATE:8>20241228");
        assert_eq!(adif_field("callsign", ""), "");
    }
}

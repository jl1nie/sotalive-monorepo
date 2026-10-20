//! logconv(sotaapp2)の e2e テストのフィクスチャを作る: FLE のログ(`*.fle`)から、FLE Online が出すファイル
//!
//!     cargo run -p fle-core --example logconv_fixtures -- ~/src/sotaapp2/test_data/logconv/fle
//!
//! 指定したディレクトリの `名前.fle` ごとに、`名前/` に ZIP の中身をそのまま書く(HAMLOG の CSV は Shift_JIS・CRLF)。
//! 作り直すときは、古い `名前/` を消してから書く(なくなったファイルが残らないように)。

use std::io::Read;
use std::path::Path;

fn main() {
    let dir = std::env::args()
        .nth(1)
        .expect("usage: logconv_fixtures <dir>");
    let dir = Path::new(&dir);
    // ファイル名の日時(エラーのときだけ使う)。作り直しても同じ中身になるよう、固定する
    let now = chrono::NaiveDate::from_ymd_opt(2025, 10, 18)
        .unwrap()
        .and_hms_opt(0, 0, 0)
        .unwrap();

    let mut sources: Vec<_> = std::fs::read_dir(dir)
        .expect("read dir")
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|x| x == "fle"))
        .collect();
    sources.sort();

    for source in sources {
        let text = std::fs::read_to_string(&source).expect("read .fle");
        let result = fle_core::compile_fle(&text);
        assert!(
            result.errors.is_empty(),
            "{}: {:?}",
            source.display(),
            result.errors
        );
        let zip = fle_core::generate_fle_output(&result, now).expect("generate");

        let out = source.with_extension("");
        if out.exists() {
            std::fs::remove_dir_all(&out).expect("remove old output");
        }
        std::fs::create_dir_all(&out).expect("create output dir");
        let mut archive = zip::ZipArchive::new(std::io::Cursor::new(zip)).expect("zip");
        for i in 0..archive.len() {
            let mut file = archive.by_index(i).expect("zip entry");
            let mut body = Vec::new();
            file.read_to_end(&mut body).expect("read entry");
            std::fs::write(out.join(file.name()), body).expect("write");
            println!("{}/{}", out.display(), file.name());
        }
    }
}

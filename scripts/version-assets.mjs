// 手組みの旧版(apps/*-org)の index.html は、ローカルの JS・CSS をバージョン無しのファイル名で読む。
// デプロイしても、ブラウザーや Cloudflare のエッジが古いファイルを使い続けることがある(キャッシュ事故)。
// この script は、出力の index.html のローカルな .js/.css 参照に、そのファイルの内容ハッシュを ?v= で付ける。
// 変わったファイルだけ URL が変わるので、古い版が残らない。Vite のアプリはファイル名が既にハッシュ済みなので、対象外。
//   node scripts/version-assets.mjs <出力ディレクトリ>   例: dist-myact
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

const dist = process.argv[2];
if (!dist) {
  console.error('使い方: node scripts/version-assets.mjs <出力ディレクトリ>');
  process.exit(1);
}

const indexPath = join(dist, 'index.html');
const html = readFileSync(indexPath, 'utf8');
const root = resolve(dist);

// src="..." / href="..." のうち、ローカル(http・javascript・#・data でない)で .js か .css のものだけ。
// 末尾が .js"/.css"(?v= がまだ無い)にだけ当てる。javascript:onProgChange(0); などは当たらない。
const re = /\b(src|href)="(?!https?:|javascript:|#|data:)([^"?]+\.(?:js|css))"/g;

let changed = 0;
const out = html.replace(re, (whole, attr, ref) => {
  // ルート参照(/foo.js)も、dist のルートから引く
  const filePath = resolve(root, ref.replace(/^\/+/, ''));
  if (resolve(filePath) !== filePath || !filePath.startsWith(root)) {
    throw new Error(`参照が出力の外を指している: ${ref}`);
  }
  let content;
  try {
    content = readFileSync(filePath);
  } catch {
    throw new Error(`参照先のファイルがない: ${ref} (${filePath})`);
  }
  const v = createHash('sha256').update(content).digest('hex').slice(0, 8);
  changed++;
  return `${attr}="${ref}?v=${v}"`;
});

writeFileSync(indexPath, out);
console.log(`version-assets: ${dist}/index.html の ${changed} 件に ?v= を付けた`);

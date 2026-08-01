#!/usr/bin/env node
// Extract the rshogi-nnue evaluation function from a KIOU asset bundle.
//
//   node scripts/extract-nn.mjs <bundle> [-o nn.bin]
//
// The browser version of this lives in docs/index.html — keep the two in sync.

import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename } from "node:path";

// Known-good values for the eval shipped with catalog version asset-3.0.
const KNOWN = {
  size: 32109309,
  sha256: "a81a86090c0604e5f991f0e66df9b7d80469769c7c5214767e0d449daebadfb9",
  arch: "HalfKP(Friend)[125388->128x2]",
};

// ---------------------------------------------------------------------------
// LZ4 block decompressor
//
// UnityFS uses raw LZ4 blocks (not the LZ4 frame format). LZ4HC is only a
// higher-effort encoder — the decoder below handles both.
// ---------------------------------------------------------------------------
function lz4Decompress(src, destSize) {
  const dst = new Uint8Array(destSize);
  const sEnd = src.length;
  let s = 0, d = 0;

  while (s < sEnd) {
    const token = src[s++];

    let litLen = token >>> 4;
    if (litLen === 15) {
      let n;
      do { n = src[s++]; litLen += n; } while (n === 255);
    }
    if (s + litLen > sEnd || d + litLen > destSize) throw new Error("LZ4: literal run overflows buffer");
    dst.set(src.subarray(s, s + litLen), d);
    s += litLen; d += litLen;

    // the final sequence ends after its literals
    if (s >= sEnd) break;

    const offset = src[s++] | (src[s++] << 8);
    if (offset === 0 || offset > d) throw new Error("LZ4: match offset out of range");
    let matchLen = token & 0x0f;
    if (matchLen === 15) {
      let n;
      do { n = src[s++]; matchLen += n; } while (n === 255);
    }
    matchLen += 4;
    if (d + matchLen > destSize) throw new Error("LZ4: match run overflows buffer");

    // must be byte-wise: matches are allowed to overlap the write cursor
    let m = d - offset;
    for (let i = 0; i < matchLen; i++) dst[d++] = dst[m++];
  }

  if (d !== destSize) throw new Error(`LZ4: expected ${destSize} bytes, produced ${d}`);
  return dst;
}

// ---------------------------------------------------------------------------
// UnityFS container
// ---------------------------------------------------------------------------
function Reader(buf) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let p = 0;
  return {
    get pos() { return p; },
    set pos(v) { p = v; },
    u16() { const v = view.getUint16(p, false); p += 2; return v; },
    u32() { const v = view.getUint32(p, false); p += 4; return v; },
    i64() { const v = view.getBigInt64(p, false); p += 8; return Number(v); },
    bytes(n) { const v = buf.subarray(p, p + n); p += n; return v; },
    cstr() {
      const start = p;
      while (p < buf.length && buf[p] !== 0) p++;
      const v = new TextDecoder().decode(buf.subarray(start, p));
      p++; // NUL
      return v;
    },
    align(n) { p = Math.ceil(p / n) * n; },
  };
}

const COMPRESSION = { 0: "none", 1: "LZMA", 2: "LZ4", 3: "LZ4HC" };

function decompressBlock(chunk, uncompressedSize, flags) {
  const kind = flags & 0x3f;
  if (kind === 0) return chunk;
  if (kind === 2 || kind === 3) return lz4Decompress(chunk, uncompressedSize);
  throw new Error(`未対応の圧縮形式です: ${COMPRESSION[kind] ?? kind}`);
}

/** Unwrap a UnityFS bundle into its concatenated SerializedFile payload. */
function unpackUnityFS(buf) {
  const r = Reader(buf);

  const signature = r.cstr();
  if (signature !== "UnityFS") throw new Error(`UnityFS ではありません（signature=${signature || "?"}）`);

  const format = r.u32();
  const unityVersion = r.cstr();
  const unityRevision = r.cstr();
  r.i64();                          // total bundle size
  const compressedInfoSize = r.u32();
  const uncompressedInfoSize = r.u32();
  const flags = r.u32();

  if (flags & 0x80) throw new Error("blocksInfoAtEnd 付きのバンドルには未対応です");

  // format 7+ pads the header out to a 16-byte boundary
  if (format >= 7) r.align(16);

  const info = decompressBlock(r.bytes(compressedInfoSize), uncompressedInfoSize, flags);

  // ...and 0x200 pads again, this time in front of the data blocks
  if (flags & 0x200) r.align(16);

  const ir = Reader(info);
  ir.pos = 16;                      // skip uncompressedDataHash
  const blockCount = ir.u32();

  const blocks = [];
  let total = 0;
  for (let i = 0; i < blockCount; i++) {
    const uncompressedSize = ir.u32();
    const compressedSize = ir.u32();
    const blockFlags = ir.u16();
    blocks.push({ uncompressedSize, compressedSize, blockFlags });
    total += uncompressedSize;
  }

  const out = new Uint8Array(total);
  let o = 0;
  for (const b of blocks) {
    out.set(decompressBlock(r.bytes(b.compressedSize), b.uncompressedSize, b.blockFlags), o);
    o += b.uncompressedSize;
  }

  return { data: out, format, unityVersion, unityRevision, blockCount };
}

// ---------------------------------------------------------------------------
// NNUE payload
//
// The bundle holds a single TextAsset. Rather than walking the SerializedFile
// type tree we locate the NNUE magic and trust m_Script's length prefix, which
// sits in the 4 bytes immediately before it.
// ---------------------------------------------------------------------------
const NNUE_MAGIC = [0x16, 0x2f, 0xf3, 0x7a];   // 0x7AF32F16 little-endian

function findEval(data) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  for (let i = 4; i + 4 <= data.length; i++) {
    if (data[i] !== NNUE_MAGIC[0] || data[i + 1] !== NNUE_MAGIC[1] ||
        data[i + 2] !== NNUE_MAGIC[2] || data[i + 3] !== NNUE_MAGIC[3]) continue;

    const length = view.getInt32(i - 4, true);   // TextAsset.m_Script length prefix
    if (length <= 0 || i + length > data.length) continue;

    const payload = data.subarray(i, i + length);
    return { payload, offset: i, arch: readArch(payload) };
  }

  throw new Error("NNUE 評価関数が見つかりません。rshogi_nn 以外のバンドル（policy / sunfish4 など）ではありませんか？");
}

/** Header: magic(4) + hash(4) + archStringLength(4) + arch string. */
function readArch(payload) {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const len = view.getUint32(8, true);
  if (len === 0 || 12 + len > payload.length) return null;
  return new TextDecoder("utf-8").decode(payload.subarray(12, 12 + len));
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function usage(code) {
  console.error(`使い方: node ${basename(process.argv[1])} <bundle> [-o nn.bin]`);
  process.exit(code);
}

const args = process.argv.slice(2);
if (args.length === 0 || args.includes("-h") || args.includes("--help")) usage(args.length === 0 ? 1 : 0);

const oIndex = args.findIndex((a) => a === "-o" || a === "--output");
const output = oIndex === -1 ? "nn.bin" : args[oIndex + 1];
if (oIndex !== -1 && !output) usage(1);
const input = args.filter((a, i) => i !== oIndex && i !== oIndex + 1)[0];
if (!input) usage(1);

const buf = new Uint8Array(await readFile(input));
const bundle = unpackUnityFS(buf);
const { payload, arch } = findEval(bundle.data);
const sha256 = createHash("sha256").update(payload).digest("hex");

await writeFile(output, payload);

const fmt = (n) => n.toLocaleString("en-US");
console.log(`unity    : ${bundle.unityRevision} (format ${bundle.format}, ${bundle.blockCount} blocks)`);
console.log(`arch     : ${arch ?? "(不明)"}`);
console.log(`size     : ${fmt(payload.length)} バイト`);
console.log(`sha256   : ${sha256}`);
console.log(`output   : ${output}`);

if (payload.length === KNOWN.size && sha256 === KNOWN.sha256) {
  console.log("\n✓ 既知の評価関数（asset-3.0）と一致しました");
} else if (arch?.includes(KNOWN.arch)) {
  console.log("\n✓ 取り出しました（既知のハッシュとは不一致 — 評価関数が更新された可能性があります）");
} else {
  console.error(`\n⚠ 想定と違うネットワーク構成です。配布中のエンジンは ${KNOWN.arch} 専用ビルドのため読み込めません。`);
  process.exit(2);
}

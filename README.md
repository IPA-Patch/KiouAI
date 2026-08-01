<h1 align="center">KiouAI</h1>

<p align="center">
  <em>棋桜（KIOU）の内蔵 NNUE 評価関数を、デスクトップのやねうら王で動かすための配布リポジトリ。<br/>
  配信アセットから評価関数を取り出すブラウザツールと、それを読み込める専用ビルドのエンジンを提供します。</em>
</p>

<p align="center">
  <img alt="eval" src="https://img.shields.io/badge/eval-halfkp__128x2--32--32-2f80ed?style=flat-square" />
  <img alt="engine" src="https://img.shields.io/badge/engine-YaneuraOu%20NNUE-ff66a3?style=flat-square" />
  <img alt="protocol" src="https://img.shields.io/badge/protocol-USI-555?style=flat-square" />
  <img alt="platform" src="https://img.shields.io/badge/platform-macOS%20%2F%20Windows%20%2F%20Linux-blue?style=flat-square" />
  <img alt="converter" src="https://img.shields.io/badge/converter-client--side%20only-1f9d55?style=flat-square" />
</p>

---

**棋桜（KIOU）** は株式会社ネコノメによるオンライン将棋対戦アプリです
（[App Store](https://apps.apple.com/jp/app/%E6%A3%8B%E6%A1%9C/id6755948307)）。
アプリには対局後の棋譜解析とヒント表示のために **rshogi-nnue**（Rust 実装のやねうら王系 NNUE エンジン）が内蔵されています。

その評価関数はやねうら王と同じ NNUE シリアライズ形式ですが、ネットワーク構成が本家標準の `halfkp_256x2-32-32` ではなく
**`halfkp_128x2-32-32`** のため、配布されている通常のやねうら王ではそのまま読み込めません。

KiouAI は、

- **その構成でビルドしたやねうら王バイナリ**を [Releases](../../releases) で配布し、
- **配信アセット（`.bundle`）から評価関数を取り出すブラウザツール**を提供する

ためのリポジトリです。将棋所・ShogiGUI・ShogiHome などの USI 対応 GUI から、KIOU と同じ評価関数で検討できるようになります。

> [!IMPORTANT]
> **評価関数（`nn.bin`）そのものはこのリポジトリでは配布しません。**
> 学習済み重みの権利は株式会社ネコノメに帰属します。利用者は公式の配信 CDN から `.bundle` を直接ダウンロードし、
> 手元のブラウザ内で変換してください。変換ツールは完全にクライアントサイドで動作し、ファイルはどこにも送信されません。
> 取り出した評価関数の再配布はしないでください。

## 手順

### 1. 配信アセットをダウンロードする

評価関数は KIOU の公式アセット配信 CDN から誰でも取得できます。以下を直接ダウンロードしてください（約 19.4 MiB）。

```
https://t4-asset.neconome-storage.uk/production/asset-3.0/iOS/1cef6109d3ae10e89f6a7c210e2413d5.bundle
```

```sh
curl -O https://t4-asset.neconome-storage.uk/production/asset-3.0/iOS/1cef6109d3ae10e89f6a7c210e2413d5.bundle
```

これは YooAsset の `remote_assets__project__game_aiparam_rshogi_nn.bundle` に対応するファイルです。
URL が 404 になった場合は[アセット URL の調べ方](#アセット-url-の調べ方)を参照してください。

### 2. ブラウザで `nn.bin` に変換する

**<https://ipa-patch.github.io/KiouAI/>** を開き、ダウンロードした `.bundle` をドラッグ＆ドロップします。
`nn.bin` がダウンロードされます。

処理はすべてブラウザ内で完結します（サーバーへのアップロードはありません）。
`docs/` 以下のページを `file://` で開いてもそのまま動作します。

> [!NOTE]
> 配信 CDN は CORS ヘッダ（`Access-Control-Allow-Origin`）を返さないため、
> ツール側から URL を直接 fetch することはできません。ダウンロードは手動でお願いします。

コマンドラインで済ませたい場合は同等の Node スクリプトも用意しています（依存パッケージなし・Node 18 以降）。

```sh
node scripts/extract-nn.mjs 1cef6109d3ae10e89f6a7c210e2413d5.bundle -o nn.bin
```

### 3. エンジンを入手する

[Releases](../../releases) から実行環境に合うバイナリをダウンロードします。

| ファイル | 対象 |
|---|---|
| `YaneuraOu-Kiou-macos-arm64` | macOS（Apple Silicon） |
| `YaneuraOu-Kiou-windows-avx2.exe` | Windows x64（AVX2 対応 CPU） |
| `YaneuraOu-Kiou-linux-avx2` | Linux x64（AVX2 対応 CPU） |
| `YaneuraOu-Kiou-linux-arm64` | Linux arm64 |

いずれも `halfkp_128x2-32-32` 専用ビルドです。**本家配布のやねうら王や、他の評価関数（水匠・elmo など）とは互換性がありません。**

### 4. 配置する

やねうら王は既定で `EvalDir` = `eval`、`EvalFile` = `nn.bin` を読みに行きます。
実行ファイルと同じ階層に `eval/` を作り、`nn.bin` を置いてください。

```
YaneuraOu-Kiou-macos-arm64
eval/
  └── nn.bin
```

別の場所に置く場合は USI オプションで指定します。

```
setoption name EvalDir value /path/to/dir
setoption name EvalFile value nn.bin
```

### 5. 動作を確認する

```sh
./YaneuraOu-Kiou-macos-arm64
usi
isready
position startpos
go depth 12
```

`isready` に対して `readyok` が返れば評価関数の読み込みに成功しています。
ハッシュ値や次元数が一致しない場合はここでエラーになって終了します。

### 6. GUI に登録する

将棋所 / ShogiGUI / ShogiHome などにエンジンとして登録します。
`eval/nn.bin` は実行ファイルからの相対パスで解決されるため、
**作業ディレクトリを実行ファイルの場所に設定**するか、`EvalDir` に絶対パスを設定してください。

## 評価関数の仕様

| 項目 | 値 |
|---|---|
| フォーマット版 | `0x7AF32F16`（やねうら王 / Stockfish 系 NNUE と共通） |
| 入力特徴量 | `HalfKP(Friend)` — 125,388 次元 |
| 特徴変換後の次元 | **128 × 2**（本家標準は 256 × 2） |
| 隠れ層 | `AffineTransform[32<-256]` → `ClippedReLU[32]` → `AffineTransform[32<-32]` → `ClippedReLU[32]` → `AffineTransform[1<-32]` |
| アーキテクチャ名 | **`halfkp_128x2-32-32`** |
| ファイルサイズ | 32,109,309 バイト（約 30.6 MiB） |
| SHA-256 | `a81a86090c0604e5f991f0e66df9b7d80469769c7c5214767e0d449daebadfb9` |
| `FV_SCALE` | 16（やねうら王の既定値と同じ。変更不要） |

先頭 12 バイトがマジック `16 2F F3 7A` / ハッシュ / アーキテクチャ文字列長で、その直後に以下が続きます。

```
ModelType=Standard;Features=HalfKP(Friend)[125388->128x2],Network=AffineTransform[1<-32](ClippedReLU[32](AffineTransform[32<-32](ClippedReLU[32](AffineTransform[32<-256](InputSlice[256(0:256)])))))
```

変換結果が正しいかはサイズと SHA-256 で確認できます（`asset-3.0` 時点の値）。

```sh
shasum -a 256 nn.bin
```

## 変換の仕組み

`.bundle` は Unity の **UnityFS** コンテナ（LZ4HC 圧縮）で、中に `nn` という名前の `TextAsset` が 1 つだけ入っています。
暗号化はされていません（YooAsset カタログ上も `Encrypted: False`）。

変換ツールは以下の手順で `nn.bin` を取り出します。LZ4 ブロック展開以外に依存はありません。

1. UnityFS ヘッダを読む — `UnityFS\0`、フォーマット版、Unity バージョン、リビジョン（NUL 終端文字列）に続いて
   `size:i64` / `compressedBlocksInfoSize:u32` / `uncompressedBlocksInfoSize:u32` / `flags:u32`（すべてビッグエンディアン）
2. フォーマット版が 7 以上なら 16 バイト境界にアライン
3. blocksInfo を LZ4 展開する
4. 先頭 16 バイトのハッシュを飛ばし、`blockCount:u32` に続く
   `(uncompressedSize:u32, compressedSize:u32, flags:u16)` をブロック数ぶん読む
5. `flags & 0x200`（`blockInfoNeedPaddingAtStart`）なら **ここでもう一度** 16 バイト境界にアラインする
   — この 2 段階のアラインが要注意で、片方でも飛ばすと LZ4 展開が壊れます
6. 各ブロックを LZ4 展開して連結する（`flags & 0x3f` が 2 = LZ4 / 3 = LZ4HC。どちらも同じデコーダで展開できる）
7. 連結結果から NNUE マジック `16 2F F3 7A` を探し、その **4 バイト手前のリトルエンディアン int32** を長さとして読み、
   マジック位置からその長さぶんを切り出す（`TextAsset.m_Script` の長さ前置）

`asset-3.0` の実データでは 245 ブロック・展開後 32,112,192 バイトで、マジックはオフセット 2620、長さ前置は 32,109,309 になります。

## アセット URL の調べ方

KIOU のアップデートでアセットが差し替わると、上記の URL は 404 になります。
配信カタログも公開されているので、そこから現在の URL を引けます。

```sh
BASE=https://t4-asset.neconome-storage.uk/production
VER=$(curl -s $BASE/asset-3.0/iOS/Remote.version)          # 現在のパッケージバージョン
curl -s $BASE/$VER/iOS/Remote_$VER.json \
  | jq -r '.BundleList[] | select(.BundleName|test("rshogi_nn")) | "\(.FileHash).bundle  \(.FileSize)"'
```

得られた `<FileHash>.bundle` を `$BASE/$VER/iOS/` の下から取得してください。

カタログには他の思考系アセットも含まれています。**NNUE 評価関数は `rshogi_nn` です**（名前が紛らわしいので注意）。

| バンドル名 | 中身 | サイズ |
|---|---|---|
| `..._aiparam_rshogi_nn` | **rshogi-nnue の NNUE 評価関数**（本リポジトリの対象） | 19.4 MiB |
| `..._aiparam_policy_policy` | 量子化済み ONNX のポリシーネットワーク | 10.0 MiB |
| `..._aiparam_sunfish4_eval` | Sunfish4 の評価関数 | 36.6 MiB |
| `..._aiparam_sunfish4_book` | Sunfish4 の定跡 | 506 KiB |
| `..._aiparam_strategies_*` | 戦型別のパラメータ（数 KB） | — |

## エンジンについて

### KIOU 内蔵エンジンとの違い

配布しているのは**やねうら王の探索部に KIOU の評価関数を載せたもの**であり、
KIOU アプリ内で動いている rshogi-nnue そのものではありません。

| | KIOU 内蔵（rshogi-nnue） | このリポジトリの配布ビルド |
|---|---|---|
| 評価関数 | `nn.bin`（halfkp_128x2-32-32） | 同じファイル |
| 探索部 | Rust 実装の独自探索 | やねうら王 C++ 探索 |
| 既定 `FV_SCALE` | 16 | 16 |

評価関数が同じでも探索部が異なるため、**同一局面で同じ手を返すとは限りません**。
評価値の目安はおおむね揃いますが、読み筋（PV）は一致しないと考えてください。

### 対局中の CPU 相手は再現できません

KIOU の CPU 対局・ランクマッチにおける相手の思考は **サーバー側で計算**されています（gRPC 経由）。
端末内の評価関数が使われるのは対局後の棋譜解析とヒント表示（ビギナーサポート）の部分だけです。
したがってこのリポジトリのエンジンで再現できるのは**解析側の挙動**であって、対局相手の強さではありません。

### 自分でビルドする

本家やねうら王には `halfkp_128x2-32-32` のエディションが用意されていないため、
[yaneurao/YaneuraOu](https://github.com/yaneurao/YaneuraOu) に以下を追加してビルドしています。

1. アーキテクチャヘッダを生成する

   ```sh
   python3 source/eval/nnue/architectures/nnue_arch_gen.py \
     halfkp_128x2-32-32 source/eval/nnue/architectures/
   ```

2. `source/eval/nnue/nnue_architecture.h` に分岐を追加する

   ```cpp
   #elif defined(EVAL_NNUE_HALFKP_128X2_32_32)
   #include "architectures/halfkp_128x2-32-32.h"
   ```

3. `source/Makefile` に `YANEURAOU_ENGINE_NNUE_HALFKP_128X2_32_32` エディションを追加し、
   `CPPFLAGS += -DEVAL_NNUE_HALFKP_128X2_32_32` を定義する

4. ビルドする

   ```sh
   make -C source normal \
     YANEURAOU_EDITION=YANEURAOU_ENGINE_NNUE_HALFKP_128X2_32_32 \
     TARGET_CPU=AVX2 \
     TARGET=../YaneuraOu-Kiou
   ```

Releases のバイナリはこの手順を GitHub Actions で実行したものです。

## 関連リポジトリ

| リポジトリ | 内容 |
|---|---|
| [KiouForge](https://github.com/IPA-Patch/KiouForge) | KIOU の快適化拡張（FPS・AFK 抑制・棋譜自動保存・解析パラメータ調整） |
| [KiouEngineBridge](https://github.com/IPA-Patch/KiouEngineBridge) | KIOU を CSA サーバー化して LAN 上の思考エンジンと対局させる拡張 |

## ライセンスと免責

- このリポジトリの変換ツール・スクリプト・ドキュメントは MIT ライセンスです。
- Releases で配布するエンジンバイナリは [やねうら王](https://github.com/yaneurao/YaneuraOu) の派生物であり、**GPLv3** に従います。対応するソースは同リポジトリと本リポジトリの差分で公開しています。
- **評価関数はいずれのライセンスにも含まれません。** 権利は株式会社ネコノメに帰属します。このリポジトリでは配布しておらず、利用者が公式 CDN から取得したものを私的な範囲で利用することを想定しています。再配布・商用利用はしないでください。
- 本リポジトリは株式会社ネコノメとは無関係の非公式プロジェクトです。利用によって生じたいかなる損害についても責任を負いません。

# C Code Visualizer Lite — 四則演算 学習版

授業用の新UI統合実証版です。`index.html` をブラウザで開くと、C言語の対応範囲で int の四則演算、代入、printf、処理STEPを可視化できます。1行に1つの文を書いてください。Cコンパイラや正誤判定の代わりではありません。

- CODEに書く → RUN → RESULTの出力・最終変数を見る → 「流れを見る」からSTEPをたどる。
- RUN後は、STEPがあるコード行の行番号から、その行の最初のSTEPへ移動できます。編集すると古い結果は閉じます。
- サンプルは四則演算用の6種類です。scanf等のサンプルは主導線から外しています。解析エンジン内部の機能は維持しています。
- CodeMirror 5.65.20 は `vendor/codemirror/` に同梱し、ネット接続なしでもエディタが起動します。ライセンスは同フォルダの `LICENSE` にあります。

解析エンジンは `mar-sander/c-visualizer` の main `7d2e4de9d984090b75d1b2b77554479489a94469` を複製し、STEP生成時の出力・変数スナップショットと、解析結果のUI引き渡しだけを追加しました。UIの配置・配色は `mar-sander/ui-lab-c-visualizer` の main `c68f6e0a6cfc6c53c6505fbfa0a862c159ea96dc` を基準にしています。

`tests.html` は本体から複製した回帰テストです。ブラウザで開くと同じ `script.js` を読み込み、従来の解析結果を検査します。

# C Code Visualizer Lite — 四則演算 学習版

授業用の新UI統合実証版です。`index.html` をブラウザで開くと、C言語の対応範囲で int / float / double / char scalar の基本四則演算、代入、main直下の基本if／if-elseと最大2階層の入れ子if／if-elseの処理STEPを可視化できます。printfは%d／%c／%f／%lfと小数点以下0～20桁の%.Nf／%.Nlfによる出力、main直下の単一変数scanfは%d／%f／%lf／%cに対応します。printfでfloat・doubleを表示する場合は%f（%lfも使用可能）を使い、%dは整数表示、%cは文字表示です。INPUT欄ではscanf 1回につき1行を入力します。1行に1つの文を書いてください。Cコンパイラや正誤判定の代わりではありません。

- CODEに書く → RUN → RESULTの出力・最終変数を見る → 「流れを見る」からSTEPをたどる。
- RUN後は、STEPがあるコード行の行番号から、その行の最初のSTEPへ移動できます。編集すると古い結果は閉じます。
- SECRET CODEで解除する既存SAMPLEに「配列の基本」を追加しました。選択するとコードが入り、RUNで出力50と最終配列[10, 50, 30]を確認できます。
- CodeMirror 5.65.20 は `vendor/codemirror/` に同梱し、ネット接続なしでもエディタが起動します。ライセンスは同フォルダの `LICENSE` にあります。

解析エンジンは `mar-sander/c-visualizer` の main `7d2e4de9d984090b75d1b2b77554479489a94469` を複製し、STEP生成時の出力・変数スナップショットと、解析結果のUI引き渡しだけを追加しました。UIの配置・配色は `mar-sander/ui-lab-c-visualizer` の main `c68f6e0a6cfc6c53c6505fbfa0a862c159ea96dc` を基準にしています。

`tests.html` は本体から複製した回帰テストです。ブラウザで開くと同じ `script.js` を読み込み、従来の解析結果を検査します。

## L-ARRAY1 配列の箱表示

main直下の1次元int配列（長さ1～100）、未初期化・完全初期化・部分初期化・`{0}`、定数添字による要素代入と読出しを、RESULT／VARIABLESとFLOWで確認できます。部分初期化で省略した要素は0、未初期化は「—：まだ値を入れていない要素」です。長い配列はカード内で横スクロールします。

FLOWには宣言・アクセスに関係する配列だけを、そのSTEPの値で表示します。「参照」「代入」のラベルは当該STEPだけに付き、最終状態には残りません。通常のscalar変数とも共存します。解析結果の`arrays`と`steps[].arrayViews`は値のコピーと`initialized`フラグを持ち、未初期化は`values`内のnullとfalseで明示します。エンジン内部のSymbolは渡しません。

履歴は既存JSON v1の`variables`文字列ペアへ、例`["a (int[3])", "[—, 7, —]"]`として最終状態を保存します。コード復元で自動RUNはしません。保存容量やimport上限に収まらない場合は保存失敗を表示し、実行結果と既存の保護履歴を維持します。100要素でも数値文字列は通常の10000文字上限に収まります。

既存のscalar int添字・main直下forの直接本体での配列利用は維持します。forの総合検証・圧縮境界の完了認定・for用SAMPLEはL-ARRAY2です。if／else if／while内、for内if、入れ子for内の配列操作、添字式、複数要素を読む式、配列scanf、他型・多次元配列などの未対応構文は拡張していません。

UPDATEの日付は正式公開時の実際の日本時間の日付を手動設定します。実装・プレビュー段階では既存の日付を維持し、公開承認後に`index.html`の表記1か所だけを更新します。

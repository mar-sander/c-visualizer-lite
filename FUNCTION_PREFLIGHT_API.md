# L-FUNC1 — Function Catalog / Preflight API

本ファイル群は製品から未参照です。RUN、INPUT、エディタ、解析エンジン、履歴に接続しません。

## 利用方法

Nodeでは追加パッケージ不要です。

```js
const { inspectFunctionStructure } = require('./function-preflight.js');
const result = inspectFunctionStructure(sourceCode);
```

ブラウザの開発ページでは通常scriptとして読み込むと、lexical bindingの`FunctionPreflight.inspectFunctionStructure`を利用できます。`window`のプロパティや製品状態へ書き込みません。既存のindex.htmlへscriptタグを追加しないでください。

同じ文字列には決定的なJSON互換データを返します。結果は呼出ごとに新しく生成し、別呼出との可変状態を共有しません。入力を補正・実行せず、DOM、localStorage、CodeMirror、window、既存結果、日時・乱数にも依存しません。

## 戻り値と安全上の意味

| キー | 内容 |
| --- | --- |
| schemaVersion | 1。履歴JSONのversionとは別です |
| classification | 下表の6種 |
| functions | mainを含むトップレベル関数一覧。名前・署名・仮引数・宣言／定義・本文／ヘッダ範囲・構造位置 |
| calls | mainおよびサブ関数内の呼出候補。通常のprintf／scanfは除外。caller／callee／位置／個数／引数記述／単純代入の形を保存 |
| directives | includeと未対応前処理の範囲・記述 |
| diagnostics | code・短い日本語説明・category・severity・1始まりline・range。複数件を保存 |
| safeToUseNormalPath | サブ関数の根拠と今回の構造上の阻害要因がない、という**将来のNORMAL入口候補**。任意のC本文が正しいことを保証しない |
| canOfferFunctionConfirmation | 宣言／定義・検出した呼出形の範囲で阻害診断がなく、将来の確認UI候補にできること。実行許可ではない |
| validationLevel | 常に`structure-and-call-shape-only` |
| readyForExecution | **常にfalse**。L-FUNC1を関数実行器として扱わないための明示契約 |
| deferredChecks | 本文の文法、実引数の型・初期化・値、戻り値の検証は後続Stage |
| limits／limitPolicy | 暫定防護値とその位置付け |

関数一覧の`parameters`は最初の定義があればその仮引数名を採用します。宣言だけなら最初の宣言です。各`declarations`／`definitions`にもそれぞれの仮引数・署名・`matchesCatalogSignature`を保持するため、異なる仮引数名や署名不一致を隠しません。同じ署名のプロトタイプ重複は許容し、同名の複数定義は拒否します。

`bodyRange`は開き波かっこから閉じ波かっこまで、`contentRange`はその内側です。`structures`のif／else／return等はキーワード位置と確認できる範囲を保存するだけで、実行ノードではありません。ifの評価、分岐return伝播、完全な本文構文検証は行いません。

## 分類・優先順位

阻害診断の優先順位は**AMBIGUOUS > UNKNOWN_CALL > UNSUPPORTED**です。複数の原因は捨てずdiagnosticsへ残します。阻害診断がなければ、main以外の定義あり→DEFINITE、宣言だけ→DECLARATION_ONLY、それ以外→NONEです。情報診断は分類を上書きしません。

| 分類 | 意味 | NORMAL候補 | 確認候補 |
| --- | --- | --- | --- |
| NONE | サブ関数の根拠なし、今回の構造阻害なし | true | false |
| DEFINITE | トップレベルのユーザー関数定義を確定 | false | true |
| DECLARATION_ONLY | プロトタイプだけ、呼出なし | false | true |
| UNKNOWN_CALL | 宣言／定義が解決できない呼出 | false | false |
| AMBIGUOUS | 字句・境界不整合、重複定義／main、署名不整合、引数個数不整合、定義欠落・可視性不足等 | false | false |
| UNSUPPORTED | 境界を読めても初期範囲外、または検査上限 | false | false |

例えば未定義呼出＋式中呼出はUNKNOWN_CALLですが、式中呼出の未対応診断も残します。未閉鎖括弧＋マクロならAMBIGUOUSです。両経路をfalseにして、NONEへのフォールバックを防ぎます。

## 位置情報

- `offset`：元JavaScript文字列のUTF-16 code unitの0始まり位置。
- `line`／`column`：1始まり。columnもUTF-16 code unit基準です。
- rangeは**startを含みendを含まない**半開区間。
- LFとCRLFの原文を保持。行はLFで増加し、CRLFをLFへ書き換えません。
- コメント・引用符・前処理を除外してもソース位置をずらしません。
- `source.slice(range.start.offset, range.end.offset)`で対象の原文を取得できます。

## 対応範囲

戻り型int、int引数2個のサブ関数を初期候補とします。定義には仮引数名が必要です。プロトタイプの引数名省略は認識します。関数ヘッダ内の空白・コメント・改行、次の独立行の開き波かっこを検出できます。これは後続エンジンの書式対応を約束しません。

呼出の初期形はmain直下の`先に宣言されたintスカラー = f(実引数2個);`です。実引数は識別子または符号付き10進整数リテラルの形を認識します。識別子がintか、初期化済みか、値が安全かは評価しません。`requiresRuntimeArgumentValidation:true`を保持します。

main内の通常の型・配列・initializer・if／else if／for／while・printf／scanfをサブ関数と混同しません。ただし、NONEを既存エンジンの構文受け入れ保証として使用してはいけません。

## 明示的な限界と停止

- 再帰・main呼出・サブ関数から別関数、式中／入れ子／printf引数内／宣言時／分岐やループ内の呼出は阻害診断を返します。
- void、非int署名、ポインタ／配列引数、間接呼出、グローバル変数、複雑な宣言は初期範囲外です。
- サブ関数内の配列・非int／static等の局所宣言・scanf・ループ等も、検出できる範囲で未対応診断を返します。
- 全C構文、プリプロセッサ、完全なスコープ・型解析は実装しません。無効なreturn文や任意の本文構文をすべて検証するAPIではありません。
- 前処理はincludeだけを認識します。それ以外のディレクティブ・継続マクロ・行継続コメントは安全なNONEにせず停止候補とします。ヘッダの中身は読みません。
- 定義のない未使用宣言は情報診断だけです。呼び出されるなら定義欠落の阻害診断になります。
- 呼出元より前の宣言／定義がない後置定義は、暗黙宣言を補わず可視性不足とします。
- 文字数60,000、トークン20,000、括弧深さ256、トップレベル定義128、ユーザー呼出候補512は**開発用の暫定防護値**です。上限超過はUNSUPPORTEDを返し、切り詰めたコードをNONEにしません。後続で端末に合わせて再評価します。
- 呼出形や署名が候補でも、**後続の本文検査・実行時検証を省略できません**。

## テスト

```sh
node tests-function-preflight.js
node verify-function-preflight.js
```

前者はブラウザと共通の独立ケース群、後者はVMによる禁止状態アクセス検査・製品からの未参照・決定性・不完全入力群と観測時間を追加します。必要なのはNode標準ライブラリだけです。後者は固定baseの製品ファイルと同じディレクトリで実行します。製品ファイルがない場所では未参照検査をPASSにしません。通常の製品index.htmlは変更しません。

`tests-function-preflight.html`は開発専用ページです。製品UIの完成証拠ではありません。納品の単独HTMLは同じAPI／テストのバイトを埋め込んでおり、外部依存なしで独立ケース群を表示します。ブラウザ実測・Android実機確認の有無は検証記録を参照してください。

## L-FUNC2への契約

L-FUNC2は単一mainの共通処理切り出しが対象です。このAPIを使ってRUNを自動分岐したり、関数を実行したりしません。`functions`の境界を将来共有しますが、新しい正規表現で関数範囲を再探索しないでください。引継ぎ先は元baseと成果物のハッシュを照合し、既存全回帰の実行成功を共通化の必須ゲートとします。

# C Code Visualizer Lite 検証入口

## L-EXAM3

統合runnerは`tests-typed-functions.cjs`も自動検出し、34入口を実行します。EXAM3_GATE=3A/3B/3Cで個別ゲート、無指定で全ゲートです。原文EXAM-05の完全stdout、署名0～4引数/型順序、3段階の数値変換、未対応構文・型・初期化・安全予算、typed FLOW/STEP往復、確認/取消/連打/履歴復元/INPUT、390/900/1440pxを検証します。旧void単独0引数・小数実引数・int戻り変換の期待だけ新仕様へ更新し、拒否テストは維持します。未対応署名が未呼出でもNORMALへ流さない安全契約に合わせ、対応するrouting期待を更新しました。実機は別途未確認です。5797件はL-EXAM2の基準であり、最終件数と失敗履歴はL-EXAM3納品記録を参照してください。

## 現行mainの回帰

Node.js、Playwright、pngjs、インストール済みChromeを使用します。依存は製品フォルダ外へ配置し、PLAYWRIGHT_MODULEにPlaywrightの絶対パスを設定します。

~~~powershell
node verify-suite.cjs C:\path\outside-repository\evidence
~~~

No.Mへの手動操作依頼ではなく、次の検証担当向け手順です。runnerはloopbackの空きportへRange対応の読取サーバーを起動し、16 HTML＋10 CJS＋5 Node入口を逐次実行します。結果・ログ・画像は指定したrepo外ディレクトリだけに保存します。欠けたreport、非zero終了、ブラウザerror、FAILを成功にしません。実行後にサーバーを閉じます。環境不足やtimeoutはreportを欠損/エラーとして記録します。

SUITE_ONLYにカンマ区切りの入口名を指定すると限定実行できます。JSONに選定範囲を記録するため、限定実行を全件実行と混同しないでください。無指定は全入口です。

## 現行参照と歴史比較

統合runnerの既定は現行版同士の回帰です。入力echo、RESULT連続性、黄色の入力、括弧opacity0.5を強い期待値で検査し、engine比較ではinputLineIndexを保持します。自己比較だけで退行なしを証明するものではなく、固定期待値と異常系の検査を併用します。

旧不具合を再現するnegative controlは削除していません。対象CJSを単独でLEGACY_CONTROL=1と明示的な旧baseline URL付きで実行してください。4 controlとinput-consumptionに対応します。input-consumptionでは旧metadataのないAPIと比較するときだけinputLineIndexを除き、そのfield自体の物理行対応assertは常に維持します。

歴史的FA1候補が現在のGit履歴に独立版として存在しない場合があります。最新mainを旧候補と呼んで渡すことは禁止です。LEGACY_CONTROL=1で旧URLがない場合は起動を拒否します。今回のcurrent回帰では歴史モードは未実行であり、旧版のnegative controlがPASSしたと報告しません。

## 現行表示契約と根拠

公開commit00842a2（PR #70）とstyle.cssのmax-width900pxにより、上部summary全体は900px以下で非表示、901px以上で表示されます。配列名/型/長さ、scalar文字列のDOM内容は幅にかかわらず検査し、可視性は900pxで判定します。RESULTの箱・値・未初期化・STEP前後・横scrollの検査は削除していません。320/390/600/601/800/900/901/1440pxを検査します。

## 既知問題と数え方

L-QA2ではlearning-supportが実タイマーのcloseイベント競合で途中終了する場合がありました。L-QA3ではSECRET CODEと動画のclose後処理を現在のopen状態でガードし、連続submit時の解放タイマーを置き換えています。`tests-dialog-lifecycle.cjs`は通常/reduced-motionの36ケースを実時計・ネイティブcloseイベントで検証します。通常開閉、0/5/25/100msの再表示、新しい解放の維持、自動close、連続submit、閉じ直し、Esc/背景/ボタン/直接close、動画の再生・巻戻し・focus、履歴を含みます。統合runnerがこのCJSも自動検出するため、無指定は16 HTML＋10 CJS＋5 Node入口です。元mainでの失敗と修正後の実測はL-QA3の納品記録を参照してください。catch前までの実測行だけを数え、中断後の行は未実行とします。

テスト入口間には同一ケースの重複があります。入口別件数を足した値は固有仕様数やcoverage率ではありません。Pixel5はエミュレーションで、Android実機ではありません。Chromeバージョンの固定文言を持つ古いレポートは、実際に取得したrunner/browser.versionと区別してください。

## 拡張前の改善候補

配列/関数の正例・未対応拒否・snapshot独立性・INPUT取消の契約を共有case inventoryで追跡する。legacy参照版をSHAとソースhashで保存する。実時計の競合回帰は別の明示suiteへ追加し、製品を修正して安定化する。端末の安全予算・quota・容量上限と記録量の検証を別Stageで整備する。今回、大規模なframework移行、製品test hook、既存test削除・skipは行っていません。

## L-EXAM1

無指定の統合runnerは新規 `tests-array-index-expressions.cjs` を含む16 HTML＋11 CJS＋5 Nodeの32入口を実行します。元号変換の原文と段階INPUT、read/write/printf/for内条件、各種異常添字、未実行側の構文事前検査、snapshot往復、履歴、390/900/901/1440pxを固定期待値で検証します。旧添字式拒否のうち許可文法に当たるケースは成功へ更新し、禁止構文と範囲外の拒否ケースを維持します。初版の31入口/5585件は比較基準であり、L-EXAM1の実測件数はStage証拠を参照してください。


## L-EXAM2

現在の無指定runnerは16 HTML＋12 CJS＋5 Node、全33入口です。`tests-loop-break-arrays.cjs`の137件（2A:57、2B:38、2C:42）を追加し、既存5,660件の件数は維持します。合計5,797件は入口別検証行の合計で、固有仕様数ではありません。実測PASS/FAIL/SKIPはStage納品記録を参照してください。

新入口はbreak所有範囲、更新・再判定スキップ、500境界、事前検査、安全添字、while配列snapshot、原文EXAM-01/03、INPUT/echo/履歴、FLOW全STEP往復、390/900/1440pxを検査します。比較用ソートは固定6例とseed 0x20261118のLCGによる16例を、独立した数値sortと比較します。正式ソースliteralはRev.1ケースのSHA256と照合します。

EXAM_GATE=2A/2B/2Cは新入口だけの限定段階検査です。全体回帰ではEXAM_GATEとSUITE_ONLYを設定せず全入口を実行してください。旧break/while配列の拒否期待は今回許可した範囲だけ正例へ更新し、診断suiteの旧loop内break拒否2例はcontinue拒否へ置換しました。loop外break、continue、switch、未対応ネスト、不正添字の拒否を維持します。

修正前mainの初回全体実測は32入口/5,660件中5,659 PASS・1 FAIL（INPUT reduced-motionの240ms境界）でした。製品・テストを変更しない独立再確認では当該入口21/21 PASSです。初回失敗記録も保存し、再確認の重複21件を全体件数へ加算しません。今回この表示経路の製品・テストは変更していません。


## L-EXAM4

現行の統合runnerは新規`tests-cast-width.cjs`を含む35入口（16 HTML＋14 CJS＋5 Node）です。EXAM4_GATE=4A/4B/4Cは新入口だけの段階選択、無指定は全段階です。全回帰ではSUITE_ONLYと各Stageの_GATE環境変数を外します。castの優先順位/型/安全境界/未実行構文/関数/FLOW、整数幅1～64と禁止flags、原文math診断、別ファイルのmathなし派生7反復、STEP往復/INPUT/履歴と390/900/1440pxを検証します。5951件はL-EXAM3の過去基準であり、今回の実測値は納品TEST_RESULTS.mdを参照。物理スマホ/タブレットは別途未確認です。

旧scalar castのルーティング拒否期待1件だけを合法なP3へ更新し、配列添字cast・関数実引数cast・未知型・副作用等の拒否は維持します。全体件数は基準5951＋新入口の実測125件＝6076件です。段階再検査や公開前プレビューを重複加算しません。


## L-EXAM5

現行runnerは36入口（16 HTML＋15 CJS＋5 Node）。新入口`tests-math-builtins.cjs`は5A/5B/5C/5DをEXAM5_GATEで限定でき、無指定では全段階を実行します。全回帰はSUITE_ONLYと各_GATEを外して実行します。math-reference-data.jsonは固定原文5題のC stdoutと独立数値参照で、コード本文を追加転載しません。新入口は既存公開fixtureを読み、原文SHAを照合します。

既存6076件は削除/skipせず、旧math未対応期待1件だけを原文完走へ更新しています。未知関数/副作用/不正構文の拒否を維持します。新入口166件（5A20＋5B22＋5C91＋5D33）を追加し、全体の期待件数は6242件です。実測は納品TEST_RESULTS.mdを参照してください。段階再確認・プレビュー・C参照実行は全体件数へ重複加算しません。

数値はMSVC C17の丸め前doubleと絶対/相対許容1e-12で比較し、原文stdoutはCRLF→LFのみ正規化して空白・日本語・改行を完全一致させます。sin7/cos7/tan6、90度tan未実行、事前検査/未選択分岐/FLOWで非評価、型/安全上限/INPUT/履歴/STEP snapshotを検査します。390/900/1440pxはブラウザエミュレーションであり、物理スマートフォン/タブレットの確認ではありません。


## L-EXAM-QA1

統合runnerは37入口（16 HTML＋16 CJS＋5 Node）。既存36入口6,242件を保護し、tests-correctness-flow-integrity.cjsの62件（A17＋B12＋C10＋D23）を追加します。全体期待は6,304件で、固有仕様数・coverage率ではありません。QA1_GATE=A/B/C/Dは新入口だけの限定選択です。最終全回帰ではSUITE_ONLYとQA1_GATEを含む各_GATEを外します。

既存期待値の訂正は2か所です。tests-typed-functions.cjsの符号付き小数6入力はMath.truncを期待値に使わず、intの正のゼロを含む固定期待値へ変更します。tests.htmlの2回scanfのSTEP順序1件は、printfで実際に出力する改行を引用内に保持した期待へ変更します。既存の件数・正常/拒否ケースを削除/skipしていません。

新入口はint負のゼロの6経路とObject.isによる内部符号、float/double負のゼロの対照、初期化の評価値/格納値/型/箱、配列write・条件のmath/cast記録と描画、spyでの描画時非評価、snapshot/STEP往復、幅1～64/負数/桁超過/Unicode/空白/改行/タブ/ゼロ幅文字、INPUT・履歴、390/900/1440pxを確認します。物理Android/iOS/タブレットの検証ではありません。旧監査167と、欠陥存在をPASSとする検査を含んだ旧confirm24は、新しい正式62件と別集計にします。実測結果は当該候補の引継記録を参照してください。


## L-EXAM-QA2

新入口は `tests-aggregate-recording-budget.cjs`。既存37入口6304件はファイル・件数・期待値を変更せず保護します。新入口98件を追加し、全38入口6402件を期待します。途中ゲートの再実行や同じケースの副検証は最終件数へ加算しません。

STEP/出力/累積出力snapshot/セル/説明の各予算、ソース文字/行/入力の事前上限について、要求量に対する上限-1/一致/+1を小予算で検証します。複数・入れ子for、while、if、break、配列書込/宣言/複数宣言、math/cast/負のゼロ/空白/改行/UTF-16、INPUT prefix再解析、警告続行と本当の停止、失敗履歴/過去成功の保護、390/900/1440px、例外時の偽成功防止、core既存停止を確認します。

テストは隔離ブラウザでscriptレスポンス中の不変定数だけを差し替えます。製品に設定API、URL指定、localStorage指定やwindowの可変上限を追加しません。小予算が発火した結果は安全停止の契約に対するPASSであり、そのCプログラムが正常完走したという意味ではありません。予期しないsnapshot例外は隔離レスポンスにのみ注入します。最終全回帰はSUITE_ONLYと各_GATEを外し、同じ凍結ファイル一式で実行します。物理Android/iOS/タブレット確認とは区別します。

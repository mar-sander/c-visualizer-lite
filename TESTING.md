# C Code Visualizer Lite 検証入口

## 現行mainの回帰

Node.js、Playwright、pngjs、インストール済みChromeを使用します。依存は製品フォルダ外へ配置し、PLAYWRIGHT_MODULEにPlaywrightの絶対パスを設定します。

~~~powershell
node verify-suite.cjs C:\path\outside-repository\evidence
~~~

No.Mへの手動操作依頼ではなく、次の検証担当向け手順です。runnerはloopbackの空きportへRange対応の読取サーバーを起動し、16 HTML＋9 CJS＋5 Node入口を逐次実行します。結果・ログ・画像は指定したrepo外ディレクトリだけに保存します。欠けたreport、非zero終了、ブラウザerror、FAILを成功にしません。実行後にサーバーを閉じます。環境不足やtimeoutはreportを欠損/エラーとして記録します。

SUITE_ONLYにカンマ区切りの入口名を指定すると限定実行できます。JSONに選定範囲を記録するため、限定実行を全件実行と混同しないでください。無指定は全入口です。

## 現行参照と歴史比較

統合runnerの既定は現行版同士の回帰です。入力echo、RESULT連続性、黄色の入力、括弧opacity0.5を強い期待値で検査し、engine比較ではinputLineIndexを保持します。自己比較だけで退行なしを証明するものではなく、固定期待値と異常系の検査を併用します。

旧不具合を再現するnegative controlは削除していません。対象CJSを単独でLEGACY_CONTROL=1と明示的な旧baseline URL付きで実行してください。4 controlとinput-consumptionに対応します。input-consumptionでは旧metadataのないAPIと比較するときだけinputLineIndexを除き、そのfield自体の物理行対応assertは常に維持します。

歴史的FA1候補が現在のGit履歴に独立版として存在しない場合があります。最新mainを旧候補と呼んで渡すことは禁止です。LEGACY_CONTROL=1で旧URLがない場合は起動を拒否します。今回のcurrent回帰では歴史モードは未実行であり、旧版のnegative controlがPASSしたと報告しません。

## 現行表示契約と根拠

公開commit00842a2（PR #70）とstyle.cssのmax-width900pxにより、上部summary全体は900px以下で非表示、901px以上で表示されます。配列名/型/長さ、scalar文字列のDOM内容は幅にかかわらず検査し、可視性は900pxで判定します。RESULTの箱・値・未初期化・STEP前後・横scrollの検査は削除していません。320/390/600/601/800/900/901/1440pxを検査します。

## 既知問題と数え方

learning-supportは実タイマーのcloseイベント競合で途中終了する場合があります。catch前までの実測行だけを数え、中断後の行は未実行とします。今回のフル実行は467件を完了しても、別の高速close→reopen再現で製品競合を確認しています。製品修正はL-QA2の対象外です。

テスト入口間には同一ケースの重複があります。入口別件数を足した値は固有仕様数やcoverage率ではありません。Pixel5はエミュレーションで、Android実機ではありません。Chromeバージョンの固定文言を持つ古いレポートは、実際に取得したrunner/browser.versionと区別してください。

## 拡張前の改善候補

配列/関数の正例・未対応拒否・snapshot独立性・INPUT取消の契約を共有case inventoryで追跡する。legacy参照版をSHAとソースhashで保存する。実時計の競合回帰は別の明示suiteへ追加し、製品を修正して安定化する。端末の安全予算・quota・容量上限と記録量の検証を別Stageで整備する。今回、大規模なframework移行、製品test hook、既存test削除・skipは行っていません。

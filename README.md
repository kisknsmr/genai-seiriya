# AI Chat Saver

AI チャットの会話をまとめて保存する Chrome 拡張機能です。
現在は **Gemini** に対応しています（ChatGPT / Claude は今後対応予定）。

## できること

- Gemini の全会話（または選んだ会話）を一括保存
- 保存形式
  - **Markdown（.md）**：Obsidian などでそのまま読めます
  - **HTML**：Gemini 風の見た目で、ブラウザで読めます（`index.html` に一覧付き）
- 結果は 1 つの ZIP ファイルでダウンロードされます
- 失敗した会話は ZIP 内の `errors.txt` に記録されます

## セットアップ（開発版の読み込み）

1. Chrome で `chrome://extensions` を開く
2. 右上の「デベロッパー モード」をオン
3. 「パッケージ化されていない拡張機能を読み込む」でこのフォルダを選ぶ

## 使い方

1. https://gemini.google.com を開く（ログイン済みであること）
2. サイドバーの「一括保存」を押す（会話一覧のすぐ上）
3. 保存したい会話にチェックを入れ、形式を選んで「保存する」

> 補足: Gemini の制限（約 50 回/分）を超えないよう、1 件あたり約 1.3 秒かけて取得します。
> 500 件なら約 11 分かかります。途中で「中止」すると、それまでの分を保存します。

## フォルダ構成

```
manifest.json
src/core/zip.js            ZIP 作成（外部ライブラリなし）
src/core/markdown.js       Markdown → HTML 変換
src/core/exporters.js      会話 → .md / .html（全サービス共通）
src/platforms/gemini.js    Gemini から会話を取得
src/content/gemini-ui.js   Gemini 画面のボタンとパネル
```

ChatGPT / Claude 対応時は `src/platforms/` に取得処理を、`src/content/` に UI の読み込みを追加します。

## 注意

- Gemini の非公開 API を使っているため、Gemini 側の変更で動かなくなる可能性があります。
- 画像・添付ファイルは保存対象外です（テキストのみ）。

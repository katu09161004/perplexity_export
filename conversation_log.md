# Perplexity Thread Exporter 開発記録

**日付:** 2025-12-19

---

## 概要

Perplexity AIの過去のスレッドをMarkdown形式で保存するChrome拡張機能を作成した。

## 経緯

### 1. 初期要件

- OS: macOS
- ブラウザ: Chrome
- ログイン方法: Google認証
- 目的: Perplexityの過去のスレッドをすべてMarkdown形式で保存

### 2. 最初のアプローチ（Python + Playwright）

最初はPython + Playwrightでブラウザ自動化スクリプトを作成。

**問題発生:**
```
あなたがボットではないことを確認します。これには数秒かかる場合があります。
```
Cloudflareのボット検出に引っかかり、先に進めなくなった。

### 3. Chrome拡張機能への変更

ボット検出を回避するため、Chrome拡張機能として再実装。

**作成したファイル:**
- `chrome_extension/manifest.json` - 拡張機能の設定
- `chrome_extension/popup.html` - UIのHTML
- `chrome_extension/popup.js` - メインロジック
- `chrome_extension/icon48.png`, `icon128.png` - アイコン

### 4. 発生した問題と解決

#### 問題1: executeScript エラー
```
エラー: Cannot read properties of undefined (reading 'executeScript')
```

**原因:** `chrome.scripting` APIの権限不足

**解決:** `manifest.json`に権限を追加
```json
"permissions": [
  "activeTab",
  "downloads",
  "scripting",  // 追加
  "tabs"        // 追加
]
```

#### 問題2: 全スレッドが取得できない（20件で止まる）

**原因:**
- スクロール回数が不足
- 待機時間が短い
- セレクタが限定的

**解決:**
- スクロール回数: 50回 → 100回に増加
- 待機時間: 1秒 → 1.5秒に延長
- 複数のセレクタで検索するよう改善
- スクロール可能なコンテナも探索

## 最終的な機能

### インストール方法
1. `chrome://extensions/` を開く
2. デベロッパーモードをON
3. 「パッケージ化されていない拡張機能を読み込む」
4. `chrome_extension` フォルダを選択

### 使い方
1. Perplexityにログイン
2. 拡張機能アイコンをクリック
3. 「現在のスレッドを保存」または「全スレッドを保存」を選択

### 出力
- ダウンロードフォルダの `perplexity_export/` に保存
- `_index.md` - スレッド一覧
- `0001_タイトル.md`, `0002_タイトル.md`, ... - 各スレッド

## GitHubリポジトリ

https://github.com/katu09161004/perplexity_export

## 補足: macOSでの「).md」ファイル検索方法

Finderでワイルドカード `*` は使えない。

**Finderで検索:**
1. Cmd + F
2. 条件を「名前」「次で終わる」に設定
3. `).md` と入力

**ターミナルで検索:**
```bash
find ~/Downloads -name "*).md"
```

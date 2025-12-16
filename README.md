# Perplexity スレッド エクスポーター

Perplexity AIの過去のスレッドをMarkdown形式で保存するスクリプトです。

## 動作環境

- macOS
- Python 3.8+
- Chrome（Playwrightが内部でChromiumを使用）

## セットアップ

```bash
# 依存パッケージをインストール
pip install -r requirements.txt

# Playwrightブラウザをインストール
playwright install chromium
```

## 使い方

```bash
python export_perplexity.py
```

### 実行の流れ

1. ブラウザが起動します
2. Perplexityにアクセスします
3. 初回は手動でGoogleログインが必要です
   - ブラウザでログイン操作を行ってください
   - 完了後、ターミナルでEnterキーを押してください
4. ライブラリから全スレッドを自動取得します
5. 各スレッドをMarkdownファイルとして保存します

### 出力

- `perplexity_threads/` ディレクトリに保存されます
- `index.md`: スレッド一覧
- `0001_タイトル.md`, `0002_タイトル.md`, ...: 各スレッド

## 注意事項

- ログイン状態は `~/.perplexity_export_profile` に保存され、2回目以降は自動ログインされます
- Perplexityの仕様変更により動作しなくなる可能性があります
- 大量のスレッドがある場合、時間がかかります

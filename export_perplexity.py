#!/usr/bin/env python3
"""
Perplexity AIの過去のスレッドをMarkdown形式でエクスポートするスクリプト
macOS + Chrome + Google認証対応

使用方法:
1. pip install playwright
2. playwright install chromium
3. python export_perplexity.py
"""

import asyncio
import os
import re
from datetime import datetime
from pathlib import Path

try:
    from playwright.async_api import async_playwright
except ImportError:
    print("Playwrightをインストールしてください: pip install playwright && playwright install chromium")
    exit(1)


class PerplexityExporter:
    def __init__(self, output_dir: str = "perplexity_threads"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)
        self.browser = None
        self.context = None
        self.page = None

    async def start_browser(self):
        """ブラウザを起動（ユーザーデータを保持して再ログインを回避）"""
        playwright = await async_playwright().start()

        # ユーザーデータディレクトリを指定してログイン状態を保持
        user_data_dir = Path.home() / ".perplexity_export_profile"

        self.context = await playwright.chromium.launch_persistent_context(
            user_data_dir=str(user_data_dir),
            headless=False,  # ログイン操作のため可視化
            viewport={"width": 1280, "height": 800},
            locale="ja-JP",
        )
        self.page = await self.context.new_page()

    async def login_with_google(self):
        """Googleアカウントでログイン"""
        await self.page.goto("https://www.perplexity.ai/")
        await asyncio.sleep(2)

        # ログイン状態確認
        if await self._is_logged_in():
            print("✓ 既にログイン済みです")
            return True

        print("Googleでログインしてください...")
        print("ブラウザでログイン操作を行った後、Enterキーを押してください")

        # ログインボタンをクリック
        try:
            login_btn = await self.page.query_selector('button:has-text("Sign in"), button:has-text("ログイン"), [data-testid="sign-in-button"]')
            if login_btn:
                await login_btn.click()
                await asyncio.sleep(1)

            # Googleログインオプションを探す
            google_btn = await self.page.query_selector('button:has-text("Google"), [data-provider="google"]')
            if google_btn:
                await google_btn.click()
        except Exception as e:
            print(f"自動クリックに失敗: {e}")

        # ユーザーの手動ログインを待機
        input("ログイン完了後、Enterキーを押してください...")

        if await self._is_logged_in():
            print("✓ ログイン成功")
            return True
        else:
            print("✗ ログインに失敗しました")
            return False

    async def _is_logged_in(self) -> bool:
        """ログイン状態を確認"""
        await asyncio.sleep(1)
        # ライブラリやプロフィールアイコンの存在で判定
        selectors = [
            '[data-testid="user-menu"]',
            'button[aria-label*="profile"]',
            'a[href="/library"]',
            '[class*="avatar"]',
            '[class*="user"]'
        ]
        for selector in selectors:
            element = await self.page.query_selector(selector)
            if element:
                return True
        return False

    async def get_thread_list(self) -> list:
        """スレッド一覧を取得"""
        print("スレッド一覧を取得中...")

        # ライブラリページへ移動
        await self.page.goto("https://www.perplexity.ai/library")
        await asyncio.sleep(3)

        threads = []
        scroll_count = 0
        max_scrolls = 50  # 最大スクロール回数

        while scroll_count < max_scrolls:
            # スレッドリンクを収集
            thread_elements = await self.page.query_selector_all('a[href*="/search/"]')

            for element in thread_elements:
                href = await element.get_attribute("href")
                if href and "/search/" in href:
                    # タイトルを取得
                    title = await element.inner_text()
                    title = title.strip()[:100] if title else "Untitled"

                    full_url = f"https://www.perplexity.ai{href}" if href.startswith("/") else href

                    if full_url not in [t["url"] for t in threads]:
                        threads.append({
                            "url": full_url,
                            "title": title
                        })

            # スクロールして更に読み込む
            previous_count = len(threads)
            await self.page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            await asyncio.sleep(1.5)

            # 新しいスレッドが見つからなければ終了
            thread_elements_after = await self.page.query_selector_all('a[href*="/search/"]')
            if len(thread_elements_after) == len(thread_elements) and scroll_count > 3:
                break

            scroll_count += 1
            print(f"  スクロール {scroll_count}: {len(threads)} スレッド発見")

        print(f"✓ {len(threads)} 個のスレッドを発見")
        return threads

    async def export_thread(self, url: str, title: str, index: int) -> str:
        """単一スレッドをMarkdownに変換"""
        print(f"  [{index}] {title[:50]}... をエクスポート中")

        await self.page.goto(url)
        await asyncio.sleep(3)

        markdown_content = f"# {title}\n\n"
        markdown_content += f"URL: {url}\n"
        markdown_content += f"エクスポート日時: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n"
        markdown_content += "---\n\n"

        # 質問と回答のペアを取得
        try:
            # メインコンテンツエリアを探す
            messages = await self.page.query_selector_all('[class*="prose"], [class*="message"], [class*="response"], [class*="query"]')

            if not messages:
                # 代替: ページ全体のテキストを取得
                content = await self.page.inner_text('main, [role="main"], article')
                markdown_content += content
            else:
                for msg in messages:
                    text = await msg.inner_text()
                    if text.strip():
                        markdown_content += f"{text.strip()}\n\n"
        except Exception as e:
            print(f"    警告: コンテンツ取得エラー - {e}")
            # フォールバック: ページ全体を取得
            try:
                body_text = await self.page.inner_text("body")
                markdown_content += body_text
            except:
                pass

        return markdown_content

    def sanitize_filename(self, title: str) -> str:
        """ファイル名として安全な文字列に変換"""
        # 無効な文字を除去
        sanitized = re.sub(r'[<>:"/\\|?*]', '', title)
        sanitized = re.sub(r'\s+', '_', sanitized)
        sanitized = sanitized[:100]  # 長さ制限
        return sanitized or "untitled"

    async def export_all(self):
        """全スレッドをエクスポート"""
        try:
            await self.start_browser()

            if not await self.login_with_google():
                print("ログインできませんでした。終了します。")
                return

            threads = await self.get_thread_list()

            if not threads:
                print("エクスポートするスレッドが見つかりませんでした")
                return

            print(f"\n{len(threads)} 個のスレッドをエクスポートします...")

            # インデックスファイルを作成
            index_content = "# Perplexity スレッド一覧\n\n"
            index_content += f"エクスポート日時: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n"

            for i, thread in enumerate(threads, 1):
                try:
                    content = await self.export_thread(thread["url"], thread["title"], i)

                    filename = f"{i:04d}_{self.sanitize_filename(thread['title'])}.md"
                    filepath = self.output_dir / filename

                    with open(filepath, "w", encoding="utf-8") as f:
                        f.write(content)

                    index_content += f"- [{thread['title']}]({filename})\n"
                    print(f"    ✓ 保存完了: {filename}")

                except Exception as e:
                    print(f"    ✗ エラー: {thread['title']} - {e}")
                    continue

                # レート制限対策
                await asyncio.sleep(1)

            # インデックスファイルを保存
            with open(self.output_dir / "index.md", "w", encoding="utf-8") as f:
                f.write(index_content)

            print(f"\n✓ エクスポート完了!")
            print(f"  保存先: {self.output_dir.absolute()}")

        finally:
            if self.context:
                await self.context.close()


async def main():
    exporter = PerplexityExporter()
    await exporter.export_all()


if __name__ == "__main__":
    asyncio.run(main())

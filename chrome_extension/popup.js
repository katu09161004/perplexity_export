// Perplexity Thread Exporter - Popup Script

class PerplexityExporter {
  constructor() {
    this.statusEl = document.getElementById('status');
    this.progressEl = document.getElementById('progress');
    this.progressFill = document.getElementById('progress-fill');
    this.progressText = document.getElementById('progress-text');
    this.logEl = document.getElementById('log');

    document.getElementById('exportCurrent').addEventListener('click', () => this.exportCurrent());
    document.getElementById('exportAll').addEventListener('click', () => this.exportAll());
  }

  showStatus(message, type = 'info') {
    this.statusEl.style.display = 'block';
    this.statusEl.textContent = message;
    this.statusEl.className = `status ${type}`;
  }

  showProgress(current, total, text) {
    this.progressEl.style.display = 'block';
    const percent = total > 0 ? (current / total) * 100 : 0;
    this.progressFill.style.width = `${percent}%`;
    this.progressText.textContent = text || `${current} / ${total}`;
  }

  hideProgress() {
    this.progressEl.style.display = 'none';
  }

  log(message) {
    this.logEl.style.display = 'block';
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.textContent = `${new Date().toLocaleTimeString()} - ${message}`;
    this.logEl.appendChild(entry);
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  async executeInTab(func, args = []) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab.url?.includes('perplexity.ai')) {
      throw new Error('Perplexityのページで実行してください');
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: func,
      args: args
    });

    return results[0]?.result;
  }

  sanitizeFilename(title) {
    return title
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 100) || 'untitled';
  }

  downloadMarkdown(filename, content) {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    chrome.downloads.download({
      url: url,
      filename: `perplexity_export/${filename}`,
      saveAs: false
    });
  }

  // 現在のスレッドをエクスポート
  async exportCurrent() {
    try {
      this.showStatus('エクスポート中...', 'info');
      this.log('現在のスレッドを取得中...');

      const result = await this.executeInTab(() => {
        // ページからスレッド内容を抽出
        const title = document.querySelector('h1, [class*="title"]')?.textContent?.trim()
          || document.title.replace(' - Perplexity', '').trim()
          || 'Untitled';

        const url = window.location.href;

        // 質問と回答を収集
        let content = '';

        // 方法1: プロセクションを探す
        const sections = document.querySelectorAll('[class*="prose"], [class*="answer"], [class*="response"], [class*="query"], [class*="question"]');

        if (sections.length > 0) {
          sections.forEach((section, i) => {
            const text = section.innerText?.trim();
            if (text && text.length > 10) {
              content += text + '\n\n---\n\n';
            }
          });
        }

        // 方法2: メインコンテンツエリア
        if (!content) {
          const main = document.querySelector('main, [role="main"], article, [class*="thread"], [class*="conversation"]');
          if (main) {
            content = main.innerText;
          }
        }

        // 方法3: フォールバック - ページ全体
        if (!content) {
          content = document.body.innerText;
        }

        return { title, url, content };
      });

      if (!result) {
        throw new Error('コンテンツを取得できませんでした');
      }

      // Markdown形式で整形
      const markdown = this.formatMarkdown(result.title, result.url, result.content);
      const filename = `${this.sanitizeFilename(result.title)}.md`;

      this.downloadMarkdown(filename, markdown);

      this.showStatus('✓ 保存完了!', 'success');
      this.log(`保存: ${filename}`);

    } catch (error) {
      this.showStatus(`エラー: ${error.message}`, 'error');
      this.log(`エラー: ${error.message}`);
    }
  }

  // 全スレッドをエクスポート
  async exportAll() {
    try {
      this.showStatus('スレッド一覧を取得中...', 'info');
      this.log('ライブラリページに移動します...');

      // 現在のタブでライブラリに移動
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab.url?.includes('perplexity.ai')) {
        throw new Error('Perplexityのページで実行してください');
      }

      // ライブラリページに移動
      await chrome.tabs.update(tab.id, { url: 'https://www.perplexity.ai/library' });

      // ページ読み込みを待機
      await this.waitForPageLoad(tab.id);
      await this.sleep(2000);

      this.log('スレッド一覧を収集中...');

      // スレッド一覧を取得（スクロールしながら）
      const threads = await this.collectAllThreads(tab.id);

      if (threads.length === 0) {
        throw new Error('スレッドが見つかりませんでした。ログインしていますか？');
      }

      this.log(`${threads.length} 個のスレッドを発見`);
      this.showProgress(0, threads.length);

      // インデックス用の配列
      const indexEntries = [];

      // 各スレッドをエクスポート
      for (let i = 0; i < threads.length; i++) {
        const thread = threads[i];
        this.showProgress(i + 1, threads.length, `${i + 1}/${threads.length}: ${thread.title.substring(0, 30)}...`);
        this.log(`エクスポート中: ${thread.title.substring(0, 40)}...`);

        try {
          // スレッドページに移動
          await chrome.tabs.update(tab.id, { url: thread.url });
          await this.waitForPageLoad(tab.id);
          await this.sleep(1500);

          // コンテンツを取得
          const content = await this.executeInTabById(tab.id, () => {
            const main = document.querySelector('main, [role="main"], article, [class*="thread"]');
            return main?.innerText || document.body.innerText;
          });

          // Markdownとして保存
          const markdown = this.formatMarkdown(thread.title, thread.url, content);
          const filename = `${String(i + 1).padStart(4, '0')}_${this.sanitizeFilename(thread.title)}.md`;

          this.downloadMarkdown(filename, markdown);
          indexEntries.push({ title: thread.title, filename });

          await this.sleep(500);

        } catch (err) {
          this.log(`スキップ: ${thread.title} - ${err.message}`);
        }
      }

      // インデックスファイルを作成
      const indexContent = this.createIndex(indexEntries);
      this.downloadMarkdown('_index.md', indexContent);

      this.hideProgress();
      this.showStatus(`✓ ${threads.length} 個のスレッドを保存しました!`, 'success');
      this.log('エクスポート完了!');

    } catch (error) {
      this.hideProgress();
      this.showStatus(`エラー: ${error.message}`, 'error');
      this.log(`エラー: ${error.message}`);
    }
  }

  async collectAllThreads(tabId) {
    const threads = [];
    let lastCount = 0;
    let noChangeCount = 0;

    // 最大スクロール回数を増やす（100回 = 大量のスレッドに対応）
    for (let scroll = 0; scroll < 100; scroll++) {
      // 現在表示されているスレッドを取得
      const newThreads = await this.executeInTabById(tabId, () => {
        // 複数のセレクタを試す
        const selectors = [
          'a[href*="/search/"]',
          'a[href*="/thread/"]',
          '[data-testid*="thread"] a',
          '[class*="thread"] a[href]',
          '[class*="library"] a[href*="/search"]'
        ];

        const links = new Set();
        selectors.forEach(sel => {
          document.querySelectorAll(sel).forEach(el => links.add(el));
        });

        const results = [];

        links.forEach(link => {
          const href = link.getAttribute('href');
          // タイトルを取得（複数の方法を試す）
          let title = link.innerText?.trim()
            || link.querySelector('[class*="title"]')?.innerText?.trim()
            || link.getAttribute('title')
            || 'Untitled';

          if (href && (href.includes('/search/') || href.includes('/thread/'))) {
            const fullUrl = href.startsWith('/')
              ? `https://www.perplexity.ai${href}`
              : href;
            // 空や短すぎるタイトルを除外
            if (title.length > 1) {
              results.push({ url: fullUrl, title: title.substring(0, 200) });
            }
          }
        });

        return results;
      });

      // 新しいスレッドを追加
      for (const thread of newThreads) {
        if (!threads.some(t => t.url === thread.url)) {
          threads.push(thread);
        }
      }

      this.log(`スクロール ${scroll + 1}: ${threads.length} 個発見`);

      // 変化がなければカウント（5回連続で変化なしなら終了）
      if (threads.length === lastCount) {
        noChangeCount++;
        if (noChangeCount >= 5) {
          this.log('これ以上スレッドが見つかりません');
          break;
        }
      } else {
        noChangeCount = 0;
        lastCount = threads.length;
      }

      // スクロール（複数の方法を試す）
      await this.executeInTabById(tabId, () => {
        // 方法1: ページ全体をスクロール
        window.scrollTo(0, document.body.scrollHeight);

        // 方法2: スクロール可能なコンテナを探してスクロール
        const scrollContainers = document.querySelectorAll('[class*="scroll"], [class*="list"], main, [role="main"]');
        scrollContainers.forEach(container => {
          if (container.scrollHeight > container.clientHeight) {
            container.scrollTop = container.scrollHeight;
          }
        });
      });

      // 待機時間を長めに（遅延ロードに対応）
      await this.sleep(1500);
    }

    return threads;
  }

  async executeInTabById(tabId, func, args = []) {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: func,
      args: args
    });
    return results[0]?.result;
  }

  async waitForPageLoad(tabId) {
    return new Promise((resolve) => {
      const listener = (updatedTabId, changeInfo) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);

      // タイムアウト
      setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }, 10000);
    });
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  formatMarkdown(title, url, content) {
    const date = new Date().toISOString().split('T')[0];
    return `# ${title}

**URL:** ${url}
**エクスポート日:** ${date}

---

${content}
`;
  }

  createIndex(entries) {
    const date = new Date().toISOString().split('T')[0];
    let content = `# Perplexity スレッド一覧

**エクスポート日:** ${date}
**スレッド数:** ${entries.length}

---

`;
    entries.forEach((entry, i) => {
      content += `${i + 1}. [${entry.title}](${entry.filename})\n`;
    });

    return content;
  }
}

// 初期化
document.addEventListener('DOMContentLoaded', () => {
  new PerplexityExporter();
});

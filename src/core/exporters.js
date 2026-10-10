// 会話データ → Markdown / HTML への変換。ChatGPT・Claude 対応時も共通で使う。
// conv:  { id, title, time(ms), url, platform }
// turns: [{ role: 'user' | 'model', text }]
(() => {
  const ACS = (window.ACS = window.ACS || {});
  const { render, escape: esc } = ACS.markdown;

  const pad = (n) => String(n).padStart(2, '0');

  function formatDate(ms, withTime = true) {
    if (!ms) return '';
    const d = new Date(ms);
    const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return withTime ? `${day} ${pad(d.getHours())}:${pad(d.getMinutes())}` : day;
  }

  function stamp(d = new Date()) {
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  }

  // Windows でも使えるファイル名にする
  function safeName(title) {
    const s = String(title || '')
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
      .replace(/\s+/g, ' ')
      .replace(/[. ]+$/, '')
      .trim();
    return (s || 'untitled').slice(0, 60);
  }

  function fileBase(conv, used) {
    const day = conv.time ? formatDate(conv.time, false).replace(/-/g, '') : 'nodate';
    const base = `${day}_${safeName(conv.title)}`;
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base}_${n}`;
    used.add(name.toLowerCase());
    return name;
  }

  const roleLabel = (role, platform) => (role === 'user' ? 'あなた' : platform);

  function toMarkdown(conv, turns) {
    const head = [
      '---',
      `title: "${String(conv.title || '').replace(/"/g, '\\"')}"`,
      `platform: ${conv.platform}`,
      conv.tag ? `tag: "${conv.tag.replace(/"/g, '\\"')}"` : null,
      `url: ${conv.url}`,
      conv.time ? `created: ${formatDate(conv.time)}` : null,
      '---',
      '',
      `# ${conv.title || '(無題)'}`,
      '',
    ].filter((l) => l !== null);
    const body = turns.map((t) => `## ${roleLabel(t.role, conv.platform)}\n\n${t.text.trim()}\n`);
    return head.join('\n') + '\n' + body.join('\n---\n\n');
  }

  const SPARKLE =
    '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><defs><linearGradient id="sp" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4285f4"/><stop offset=".6" stop-color="#9b72cb"/><stop offset="1" stop-color="#d96570"/></linearGradient></defs><path fill="url(#sp)" d="M12 1Q12.8 11.2 23 12Q12.8 12.8 12 23Q11.2 12.8 1 12Q11.2 11.2 12 1Z"/></svg>';

  // ChatGPT / Claude は各社ロゴを使わず、色付きの丸印にする
  const badge = (color, label, size) =>
    `<svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true"><circle cx="14" cy="14" r="14" fill="${color}"/><text x="14" y="${14 + size * 0.36}" text-anchor="middle" font-size="${size}" font-weight="600" font-family="sans-serif" fill="#fff">${label}</text></svg>`;

  const ICONS = {
    Gemini: SPARKLE,
    ChatGPT: badge('#10a37f', 'GPT', 9),
    Claude: badge('#d97757', 'C', 14),
  };

  const themeClass = (platform) => `p-${String(platform || '').toLowerCase()}`;

  const CSS = `
:root{--bg:#fff;--fg:#1f1f1f;--muted:#5f6368;--user:#e9eef6;--code:#f0f4f9;--border:#dde3ea;--accent:#0b57d0}
@media (prefers-color-scheme:dark){:root{--bg:#131314;--fg:#e3e3e3;--muted:#9aa0a6;--user:#282a2c;--code:#1e1f20;--border:#3c4043;--accent:#a8c7fa}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;background:var(--bg);color:var(--fg);font:16px/1.75 "Google Sans","Noto Sans JP","Hiragino Sans","Yu Gothic UI",Meiryo,sans-serif}
.wrap{max-width:780px;margin:0 auto;padding:32px 16px 96px}
header{border-bottom:1px solid var(--border);padding-bottom:16px;margin-bottom:24px}
header h1{font-size:24px;font-weight:500;margin:0 0 6px;line-height:1.4}
.meta{color:var(--muted);font-size:13px}
.meta a{color:var(--muted)}
.turn{margin:28px 0}
.user{display:flex;justify-content:flex-end}
.user .bubble{background:var(--user);border-radius:24px 4px 24px 24px;padding:12px 20px;max-width:85%;white-space:pre-wrap;word-break:break-word}
.model{display:flex;gap:16px;align-items:flex-start}
.model .icon{flex:none;margin-top:2px}
.model .body{flex:1;min-width:0;overflow-wrap:anywhere}
.body>:first-child{margin-top:0}
h1,h2,h3,h4{line-height:1.4;font-weight:500}
.code{background:var(--code);border-radius:12px;margin:12px 0;overflow:hidden}
.code-lang{font-size:12px;color:var(--muted);padding:8px 16px 0}
pre{margin:0;padding:12px 16px 16px;overflow-x:auto;font-size:14px;line-height:1.6}
code{font-family:"Google Sans Mono",Consolas,"Courier New",monospace}
:not(pre)>code{background:var(--code);padding:2px 6px;border-radius:6px;font-size:.9em}
.table{overflow-x:auto;margin:12px 0}
table{border-collapse:collapse}
th,td{border:1px solid var(--border);padding:8px 12px;text-align:left;vertical-align:top}
th{background:var(--code);font-weight:500}
blockquote{border-left:4px solid var(--border);margin:12px 0;padding:0 16px;color:var(--muted)}
hr{border:0;border-top:1px solid var(--border);margin:24px 0}
a{color:var(--accent)}
img{max-width:100%;border-radius:12px}
ul.list{list-style:none;padding:0}
ul.list li{padding:10px 0;border-bottom:1px solid var(--border);display:flex;gap:16px}
ul.list .date{color:var(--muted);font-size:13px;flex:none;width:96px}
ul.list .tag{color:var(--muted);font-size:12px;margin-left:auto;flex:none}
body.p-chatgpt{--user:#f4f4f4;--code:#f9f9f9;--accent:#10a37f}
body.p-claude{--bg:#faf9f5;--user:#f0eee6;--code:#f5f4ee;--border:#e5e2d9;--accent:#c96442}
@media (prefers-color-scheme:dark){
body.p-chatgpt{--bg:#212121;--user:#303030;--code:#171717;--border:#3a3a3a;--accent:#5cd6a8}
body.p-claude{--bg:#262624;--user:#141413;--code:#1f1e1d;--border:#3e3d39;--accent:#e08a6a}}
`;

  function page(title, inner, platform) {
    return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>${CSS}</style></head>
<body class="${themeClass(platform)}"><div class="wrap">${inner}</div></body></html>`;
  }

  function toHtml(conv, turns) {
    const meta = [
      conv.platform,
      conv.tag ? esc(conv.tag) : '',
      conv.time ? `作成 ${formatDate(conv.time)}` : '',
      `<a href="${esc(conv.url)}">元の会話を開く</a>`,
    ].filter(Boolean);
    const body = turns
      .map((t) =>
        t.role === 'user'
          ? `<div class="turn user"><div class="bubble">${esc(t.text.trim())}</div></div>`
          : `<div class="turn model"><div class="icon">${ICONS[conv.platform] || SPARKLE}</div><div class="body">${render(t.text)}</div></div>`
      )
      .join('\n');
    return page(
      conv.title || '(無題)',
      `<header><h1>${esc(conv.title || '(無題)')}</h1><div class="meta">${meta.join(' ・ ')}</div></header>\n${body}`,
      conv.platform
    );
  }

  // entries: [{ conv, base }]
  function indexHtml(entries, platform) {
    const items = entries
      .map(
        ({ conv, base }) =>
          `<li><span class="date">${esc(formatDate(conv.time, false))}</span><a href="html/${encodeURIComponent(base)}.html">${esc(conv.title || '(無題)')}</a>${conv.tag ? `<span class="tag">${esc(conv.tag)}</span>` : ''}</li>`
      )
      .join('\n');
    return page(
      `${platform} 会話一覧`,
      `<header><h1>${esc(platform)} 会話一覧</h1><div class="meta">${entries.length} 件</div></header><ul class="list">${items}</ul>`,
      platform
    );
  }

  ACS.exporters = { toMarkdown, toHtml, indexHtml, fileBase, formatDate, stamp };
})();

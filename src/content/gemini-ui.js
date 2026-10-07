// Gemini 画面に「一括保存」ボタンとパネルを表示する。
// Gemini は innerHTML を禁止している（Trusted Types）ため、要素は createElement で作る。
(() => {
  if (window.__acsLoaded) return;
  window.__acsLoaded = true;

  const ACS = window.ACS;
  const api = ACS.gemini;
  const ex = ACS.exporters;

  const CSS = `
:host{all:initial}
*{box-sizing:border-box;font-family:"Google Sans","Noto Sans JP","Yu Gothic UI",Meiryo,sans-serif}
.fab{position:fixed;right:20px;bottom:88px;z-index:2147483000;border:0;border-radius:24px;padding:10px 16px;
  background:#0b57d0;color:#fff;font-size:14px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.25)}
.fab:hover{background:#0842a0}
.overlay{position:fixed;inset:0;z-index:2147483001;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center}
.panel{width:min(720px,94vw);height:min(80vh,760px);background:#fff;color:#1f1f1f;border-radius:16px;display:flex;flex-direction:column;
  box-shadow:0 8px 32px rgba(0,0,0,.3);overflow:hidden;font-size:14px}
@media (prefers-color-scheme:dark){.panel{background:#1e1f20;color:#e3e3e3}.row:hover{background:#2a2b2d!important}
  input[type=search]{background:#131314;color:#e3e3e3;border-color:#444!important}.btn{background:#2a2b2d!important;color:#e3e3e3!important}}
.head{display:flex;align-items:center;padding:16px 20px;border-bottom:1px solid rgba(128,128,128,.25)}
.head h2{flex:1;margin:0;font-size:18px;font-weight:500}
.x{border:0;background:none;font-size:22px;cursor:pointer;color:inherit}
.tools{display:flex;gap:8px;align-items:center;padding:12px 20px;flex-wrap:wrap}
input[type=search]{flex:1;min-width:160px;padding:8px 12px;border:1px solid #ccc;border-radius:8px;font-size:14px}
.btn{border:0;border-radius:8px;padding:8px 12px;background:#e9eef6;color:#1f1f1f;cursor:pointer;font-size:13px}
.btn:disabled{opacity:.5;cursor:default}
.primary{background:#0b57d0!important;color:#fff!important;font-weight:500;padding:10px 20px}
.count{font-size:13px;opacity:.75}
.list{flex:1;overflow-y:auto;padding:0 12px;border-top:1px solid rgba(128,128,128,.15);border-bottom:1px solid rgba(128,128,128,.15)}
.row{display:flex;gap:10px;align-items:center;padding:7px 8px;border-radius:8px;cursor:pointer}
.row:hover{background:#f0f4f9}
.row .t{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.row .d{font-size:12px;opacity:.6;flex:none}
.empty{padding:40px;text-align:center;opacity:.7}
.foot{padding:12px 20px;display:flex;flex-direction:column;gap:10px}
.opts{display:flex;gap:16px;align-items:center;flex-wrap:wrap}
.opts label{display:flex;gap:6px;align-items:center;cursor:pointer}
.spacer{flex:1}
.bar{height:6px;background:rgba(128,128,128,.2);border-radius:3px;overflow:hidden}
.bar>div{height:100%;width:0;background:#0b57d0;transition:width .3s}
.status{font-size:13px;min-height:18px;white-space:pre-wrap}
.warn{color:#b3261e}
`;

  function h(tag, props = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k in el) el[k] = v;
      else el.setAttribute(k, v);
    }
    for (const c of kids.flat()) if (c != null) el.append(c instanceof Node ? c : String(c));
    return el;
  }

  // サイドバー用ボタン。文字色は Gemini のテーマ（ライト/ダーク）を引き継ぐ
  const SIDE_CSS = `
:host{display:block;container-type:inline-size;margin:4px 0}
.side{display:flex;align-items:center;gap:12px;width:100%;height:40px;padding:0 12px;border:0;border-radius:20px;
  background:transparent;color:inherit;font:500 14px "Google Sans","Noto Sans JP","Yu Gothic UI",sans-serif;cursor:pointer;text-align:left}
.side:hover{background:rgba(128,128,128,.14)}
.side svg{flex:none;width:20px;height:20px;fill:currentColor}
@container (max-width:150px){.side{width:40px;padding:0;justify-content:center}.label{display:none}}
`;

  function downloadIcon() {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', 'M12 16 7 11l1.4-1.45 2.6 2.6V4h2v8.15l2.6-2.6L17 11Zm-6 4q-.825 0-1.412-.587Q4 18.825 4 18v-3h2v3h12v-3h2v3q0 .825-.587 1.413Q18.825 20 18 20Z');
    svg.append(path);
    return svg;
  }

  const state = { convs: [], checked: new Set(), filter: '', busy: false, ctl: null, listError: null };
  let root, ui, sideHost, fab;

  // Gemini のサイドバー内で、会話一覧の直前を探す（見つからなければ null）
  function findSidebarSpot() {
    const list = document.querySelector('conversations-list');
    if (list && list.parentElement) return { parent: list.parentElement, before: list };
    const nav = document.querySelector('side-navigation-content, bard-sidenav');
    if (nav) return { parent: nav, before: nav.firstChild };
    return null;
  }

  function ensureSideButton() {
    if (sideHost && sideHost.isConnected) return true;
    const spot = findSidebarSpot();
    if (!spot) return false;
    if (!sideHost) {
      sideHost = h('div', { id: 'ai-chat-saver-side' });
      sideHost
        .attachShadow({ mode: 'open' })
        .append(
          h('style', {}, SIDE_CSS),
          h('button', { class: 'side', title: '会話を一括保存', onclick: open }, downloadIcon(), h('span', { class: 'label' }, '一括保存'))
        );
    }
    spot.parent.insertBefore(sideHost, spot.before);
    return true;
  }

  function mount() {
    const host = h('div', { id: 'ai-chat-saver-host' });
    root = host.attachShadow({ mode: 'open' });
    root.append(h('style', {}, CSS));
    document.body.append(host);
    fab = h('button', { class: 'fab', title: '会話を一括保存', onclick: open }, '💾 一括保存');

    // Gemini は画面を書き換えるため、サイドバーのボタンが消えたら付け直す。
    // 8秒たってもサイドバーが見つからない場合だけ、右下に予備ボタンを出す。
    const started = Date.now();
    const sync = () => {
      if (ensureSideButton()) fab.remove();
      else if (!fab.isConnected && Date.now() - started > 8000) root.append(fab);
    };
    let pending = false;
    new MutationObserver(() => {
      if (pending) return;
      pending = true;
      setTimeout(() => {
        pending = false;
        sync();
      }, 300);
    }).observe(document.body, { childList: true, subtree: true });
    sync();
    setTimeout(sync, 8100);
  }

  function buildPanel() {
    const search = h('input', {
      type: 'search',
      placeholder: 'タイトルで絞り込み',
      oninput: (e) => {
        state.filter = e.target.value.trim().toLowerCase();
        renderList();
      },
    });
    const list = h('div', { class: 'list' });
    const count = h('span', { class: 'count' });
    const md = h('input', { type: 'checkbox', checked: true });
    const html = h('input', { type: 'checkbox', checked: true });
    const saveBtn = h('button', { class: 'btn primary', onclick: save }, '保存する');
    const stopBtn = h('button', { class: 'btn', onclick: stop, disabled: true }, '中止');
    const reloadBtn = h('button', { class: 'btn', onclick: loadList }, '再読み込み');
    const barFill = h('div');
    const status = h('div', { class: 'status' });

    const overlay = h(
      'div',
      { class: 'overlay', onclick: (e) => e.target === overlay && close() },
      h(
        'div',
        { class: 'panel' },
        h('div', { class: 'head' }, h('h2', {}, 'Gemini の会話を一括保存'), h('button', { class: 'x', title: '閉じる', onclick: close }, '×')),
        h(
          'div',
          { class: 'tools' },
          search,
          h('button', { class: 'btn', onclick: () => setVisible(true) }, '表示中を全選択'),
          h('button', { class: 'btn', onclick: () => setVisible(false) }, '全解除'),
          reloadBtn
        ),
        list,
        h(
          'div',
          { class: 'foot' },
          h(
            'div',
            { class: 'opts' },
            h('label', {}, md, 'Markdown（.md）'),
            h('label', {}, html, 'HTML（Gemini風の見た目）'),
            h('span', { class: 'spacer' }),
            count,
            stopBtn,
            saveBtn
          ),
          h('div', { class: 'bar' }, barFill),
          status
        )
      )
    );
    return { overlay, list, count, md, html, saveBtn, stopBtn, reloadBtn, barFill, status, search };
  }

  function open() {
    if (!ui) ui = buildPanel();
    root.append(ui.overlay);
    if (!state.convs.length && !state.busy) loadList();
  }

  function close() {
    if (state.busy && !confirm('保存処理を中止して閉じますか？')) return;
    stop();
    ui.overlay.remove();
  }

  function stop() {
    if (state.ctl) state.ctl.aborted = true;
  }

  function setBusy(busy) {
    state.busy = busy;
    ui.saveBtn.disabled = busy;
    ui.reloadBtn.disabled = busy;
    ui.stopBtn.disabled = !busy;
  }

  function setStatus(text, warn = false) {
    ui.status.textContent = text;
    ui.status.className = warn ? 'status warn' : 'status';
  }

  function setBar(ratio) {
    ui.barFill.style.width = `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`;
  }

  const visible = () => state.convs.filter((c) => !state.filter || c.title.toLowerCase().includes(state.filter));

  function setVisible(on) {
    for (const c of visible()) on ? state.checked.add(c.id) : state.checked.delete(c.id);
    renderList();
  }

  function updateCount() {
    ui.count.textContent = `${state.checked.size} / ${state.convs.length} 件を選択`;
  }

  function renderList() {
    const rows = visible().map((c) => {
      const cb = h('input', {
        type: 'checkbox',
        checked: state.checked.has(c.id),
        onchange: (e) => {
          e.target.checked ? state.checked.add(c.id) : state.checked.delete(c.id);
          updateCount();
        },
      });
      return h('label', { class: 'row' }, cb, h('span', { class: 't', title: c.title }, c.title || '(無題)'), h('span', { class: 'd' }, ex.formatDate(c.time, false)));
    });
    ui.list.replaceChildren(...(rows.length ? rows : [h('div', { class: 'empty' }, state.busy ? '読み込み中…' : '会話がありません')]));
    updateCount();
  }

  const retryNote = (e, wait) => setStatus(`通信エラー（${e.message}）。${Math.round(wait / 1000)}秒後に再試行します…`, true);

  async function loadList() {
    state.ctl = { aborted: false };
    setBusy(true);
    setBar(0);
    state.convs = [];
    renderList();
    try {
      const { items, error } = await api.listConversations({
        ctl: state.ctl,
        onProgress: (n) => setStatus(`会話一覧を読み込み中… ${n} 件`),
        onRetry: retryNote,
      });
      const known = new Set(items.map((c) => c.id));
      const extra = api.sidebarConversations().filter((c) => !known.has(c.id));
      state.convs = items.concat(extra).sort((a, b) => b.time - a.time);
      state.checked = new Set(state.convs.map((c) => c.id));
      let msg = `${state.convs.length} 件の会話が見つかりました。`;
      if (extra.length) msg += `（うちサイドバーから補完 ${extra.length} 件）`;
      if (error) msg += `\n一覧の取得が途中で止まりました（${error.message}）。「再読み込み」を試してください。`;
      setStatus(msg, !!error);
    } catch (e) {
      setStatus(e instanceof ACS.AbortedError ? '読み込みを中止しました。' : `一覧を取得できません: ${e.message}`, true);
    } finally {
      setBusy(false);
      renderList();
    }
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async function save() {
    const targets = state.convs.filter((c) => state.checked.has(c.id));
    const wantMd = ui.md.checked;
    const wantHtml = ui.html.checked;
    if (!targets.length) return setStatus('保存する会話を選んでください。', true);
    if (!wantMd && !wantHtml) return setStatus('保存形式を1つ以上選んでください。', true);

    state.ctl = { aborted: false };
    setBusy(true);
    const files = [];
    const entries = [];
    const failed = [];
    const used = new Set();
    const started = Date.now();
    let done = 0;

    try {
      for (const c of targets) {
        if (state.ctl.aborted) break;
        const left = done ? Math.ceil((((Date.now() - started) / done) * (targets.length - done)) / 60000) : null;
        setStatus(`保存中 ${done + 1} / ${targets.length}：${c.title || '(無題)'}${left ? `\n残り約 ${left} 分` : ''}`);
        try {
          const turns = await api.getTurns(c.id, { ctl: state.ctl, onRetry: retryNote });
          if (!turns.length) throw new Error('本文が空でした');
          const base = ex.fileBase(c, used);
          if (wantMd) files.push({ name: `markdown/${base}.md`, data: ex.toMarkdown(c, turns) });
          if (wantHtml) files.push({ name: `html/${base}.html`, data: ex.toHtml(c, turns) });
          entries.push({ conv: c, base });
        } catch (e) {
          if (e instanceof ACS.AbortedError) break;
          failed.push(`${c.title || '(無題)'}\t${c.url}\t${e.message}`);
        }
        done++;
        setBar(done / targets.length);
      }

      if (!entries.length) {
        setStatus(state.ctl.aborted ? '中止しました。保存した会話はありません。' : '保存できた会話がありません。', true);
        return;
      }
      if (wantHtml) files.push({ name: 'index.html', data: ex.indexHtml(entries, api.platform) });
      if (failed.length) files.push({ name: 'errors.txt', data: 'タイトル\tURL\t理由\n' + failed.join('\n') + '\n' });

      download(ACS.makeZip(files), `${api.platform.toLowerCase()}_export_${ex.stamp()}.zip`);
      let msg = `${entries.length} 件を保存しました。`;
      if (state.ctl.aborted) msg = `中止しました。それまでの ${entries.length} 件を保存しました。`;
      if (failed.length) msg += `\n${failed.length} 件は失敗しました（ZIP内の errors.txt を参照）。`;
      setStatus(msg, failed.length > 0);
    } finally {
      setBusy(false);
    }
  }

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();

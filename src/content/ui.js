// AI サービスの画面に「一括保存」ボタンとパネルを表示する（Gemini / ChatGPT / Claude 共通）。
// 各サイトは innerHTML を禁止している場合がある（Trusted Types）ため、要素は createElement で作る。
(() => {
  if (window.__acsLoaded) return;
  window.__acsLoaded = true;

  const ACS = window.ACS;
  const api = ACS.platforms[location.hostname];
  if (!api) return;
  const ex = ACS.exporters;

  const CSS = `
:host{all:initial}
*{box-sizing:border-box;font-family:"Google Sans","Noto Sans JP","Yu Gothic UI",Meiryo,sans-serif}
.overlay{position:fixed;inset:0;z-index:2147483001;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center}
.panel{position:relative;width:min(720px,94vw);height:min(80vh,760px);background:#fff;color:#1f1f1f;border-radius:16px;display:flex;flex-direction:column;
  box-shadow:0 8px 32px rgba(0,0,0,.3);overflow:hidden;font-size:14px}
@media (prefers-color-scheme:dark){.panel,.dlg{background:#1e1f20;color:#e3e3e3}.row:hover{background:#2a2b2d!important}
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
.row .tag{font-size:11px;padding:1px 8px;border-radius:10px;background:rgba(128,128,128,.15);flex:none;max-width:40%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
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
.danger{background:#b3261e!important;color:#fff!important}
.dlg-back{position:absolute;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px}
.dlg{width:min(480px,100%);max-height:100%;overflow:auto;background:#fff;border-radius:12px;padding:20px;display:flex;flex-direction:column;gap:12px;
  box-shadow:0 8px 24px rgba(0,0,0,.3)}
.dlg h3{margin:0;font-size:16px;font-weight:500}
.dlg ul{margin:0;padding-left:20px;font-size:13px;opacity:.85}
.dlg li{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dlg .btns{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
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

  // サイドバー用ボタン。文字色は各サイトのテーマ（ライト/ダーク）を引き継ぐ
  const SIDE_CSS = `
:host{display:block;margin:4px 0}
.side{display:flex;align-items:center;gap:12px;width:100%;min-width:40px;height:40px;padding:0 12px;border:0;border-radius:20px;
  background:transparent;color:inherit;font:500 14px "Google Sans","Noto Sans JP","Yu Gothic UI",sans-serif;cursor:pointer;text-align:left}
.side:hover{background:rgba(128,128,128,.14)}
.side svg{flex:none;width:20px;height:20px;fill:currentColor}
.side.compact{width:40px;padding:0;justify-content:center}
.side.compact .label{display:none}
`;

  function downloadIcon() {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    // 各サイトのアイコンと見分けがつくよう、ティール→紫のグラデーションで塗る（ライト/ダークどちらでも見える中間の明るさ）
    const defs = document.createElementNS(NS, 'defs');
    const grad = document.createElementNS(NS, 'linearGradient');
    for (const [k, v] of Object.entries({ id: 'gs-grad', x1: '0', y1: '0', x2: '1', y2: '1' })) grad.setAttribute(k, v);
    for (const [offset, color] of [['0', '#14b8a6'], ['1', '#8b5cf6']]) {
      const stop = document.createElementNS(NS, 'stop');
      stop.setAttribute('offset', offset);
      stop.setAttribute('stop-color', color);
      grad.append(stop);
    }
    defs.append(grad);
    svg.append(defs);
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('fill', 'url(#gs-grad)');
    path.setAttribute('d', 'M12 16 7 11l1.4-1.45 2.6 2.6V4h2v8.15l2.6-2.6L17 11Zm-6 4q-.825 0-1.412-.587Q4 18.825 4 18v-3h2v3h12v-3h2v3q0 .825-.587 1.413Q18.825 20 18 20Z');
    svg.append(path);
    return svg;
  }

  const state = { convs: [], checked: new Set(), knownIds: new Set(), filter: '', busy: false, ctl: null, listResume: null };
  let rootHost, root, ui, sideHost, sideBtn, sideRef, sideIconOnly;

  const log = (...a) => console.info('[生成AI整理屋さん]', ...a);

  function isVisible(el) {
    // 要素でないもの（目に見えない区切り＝コメントなど）は「見えない」扱い
    if (!(el instanceof Element) || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }


  // サイドバー内で「会話一覧の直前」を探す。見えている場所だけを対象にする
  function findSidebarSpot() {
    // サイト独自の置き場所（Gemini の「チャット」見出しの直前など）
    if (api.sidebarSpot) {
      const spot = api.sidebarSpot();
      if (spot && isVisible(spot.parent)) return spot;
    }
    // サイドバーの決まった項目（「チャット」など）の直後。サイドバーを畳んでいても見つかる
    for (const sel of api.sidebarAfter || []) {
      for (const a of document.querySelectorAll(sel)) {
        if (!isVisible(a)) continue;
        // 1つしか中身のない入れ物は、まとめて1項目とみなす
        let item = a;
        while (item.parentElement && item.parentElement !== document.body && item.parentElement.children.length === 1) {
          item = item.parentElement;
        }
        if (item.parentElement) return { parent: item.parentElement, before: item.nextSibling, via: sel, ref: a };
      }
    }
    // 予備: 会話一覧の直前
    if (api.sidebarSelector) {
      for (const list of document.querySelectorAll(api.sidebarSelector)) {
        if (isVisible(list) && list.parentElement) return { parent: list.parentElement, before: list, via: api.sidebarSelector };
      }
    }
    // 予備: 会話リンクをすべて含む一番小さい箱の直前
    const links = [...document.querySelectorAll('a[href]')].filter(
      (a) => api.linkRe.test(a.getAttribute('href') || '') && isVisible(a)
    );
    if (links.length >= 2) {
      let box = links[0].parentElement;
      while (box && !links.every((a) => box.contains(a))) box = box.parentElement;
      if (box && box !== document.body && box.parentElement) return { parent: box.parentElement, before: box, via: 'links' };
    }
    return null;
  }

  // サイドバーに表示済みの会話（一覧の取りこぼし補完用）
  function sidebarConversations() {
    const out = [];
    const seen = new Set();
    for (const a of document.querySelectorAll('a[href]')) {
      const m = (a.getAttribute('href') || '').match(api.linkRe);
      if (!m || seen.has(m[1])) continue;
      seen.add(m[1]);
      out.push(api.makeConv(m[1], (api.linkTitle ? api.linkTitle(a) : a.textContent) || ''));
    }
    return out;
  }

  // 戻り値: サイドバーのボタンが実際に見えているか
  // 毎回「今いちばん良い場所」を探し、違う場所にいれば移す（読み込み途中で予備の場所に置かれた時など）
  function ensureSideButton() {
    const spot = findSidebarSpot();
    if (!spot) return isVisible(sideHost);
    if (!sideHost) {
      sideHost = h('div', { id: 'genai-seiriya-side' });
      sideBtn = h('button', { class: 'side', title: '会話を一括保存', onclick: open }, downloadIcon(), h('span', { class: 'label' }, '一括保存'));
      sideHost.attachShadow({ mode: 'open' }).append(h('style', {}, SIDE_CSS), sideBtn);
    }
    sideRef = spot.ref || null;
    sideIconOnly = !!spot.iconOnly;
    const placed = spot.before === sideHost || (sideHost.parentElement === spot.parent && sideHost.nextSibling === spot.before);
    if (!placed) {
      spot.parent.insertBefore(sideHost, spot.before);
      log('サイドバーにボタンを配置', spot.via);
    }
    return isVisible(sideHost);
  }

  // 隣の項目（ref）を実際に測り、高さ・余白・角の丸み・文字・アイコンの大きさを写す。
  // サイトごとに数値を決め打ちしないので、サイト側の見た目が変わっても追従する
  function matchLook(ref, compact) {
    const cs = getComputedStyle(ref);
    const s = sideBtn.style;
    for (const k of ['height', 'borderRadius', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight']) s[k] = cs[k];
    // アイコンだけの並びでは、隣のアイコンと同じ色（薄めの灰色など）にする
    s.color = sideIconOnly ? cs.color : '';
    s.gap = cs.columnGap && cs.columnGap !== 'normal' ? cs.columnGap : '';
    s.width = compact ? cs.width : '';
    s.paddingLeft = compact ? '0' : cs.paddingLeft;
    s.paddingRight = compact ? '0' : cs.paddingRight;
    // Gemini（mat-icon）や Claude（data-cds="Icon"）は、文字で描くアイコン
    const icon = ref.querySelector('svg, mat-icon, [data-cds="Icon"]');
    const r = icon && icon.getBoundingClientRect();
    if (r && r.width > 0) {
      const svg = sideBtn.querySelector('svg');
      svg.style.width = r.width + 'px';
      svg.style.height = r.height + 'px';
    }
    // アイコンだけのときは、ロゴにくっつかないよう少し空け、右側の項目は右端へ寄せる
    sideHost.style.margin = sideIconOnly ? '0 auto 0 4px' : '0';
    // アイコンの並びが横並びの箱でなくても、横に並ぶようにする
    sideHost.style.display = sideIconOnly ? 'inline-block' : '';
  }

  function mount() {
    rootHost = h('div', { id: 'genai-seiriya-host' });
    root = rootHost.attachShadow({ mode: 'open' });
    root.append(h('style', {}, CSS));
    document.body.append(rootHost);
    log('読み込み完了');

    // サイトは画面を何度も書き換えるため、ボタンが消えたら付け直す。
    // サイドバーが無い画面（シークレットチャット等）ではボタンを出さない
    const sync = () => {
      if (ensureSideButton()) {
        const w = sideHost.parentElement.getBoundingClientRect().width;
        // アイコンだけの並び（ChatGPT の見出しなど）では、幅に関係なく常にアイコンだけにする
        const compact = sideIconOnly || w < 150;
        sideBtn.classList.toggle('compact', compact);
        if (api.matchSideLook || sideIconOnly) {
          if (!sideRef || !sideRef.isConnected) sideRef = (findSidebarSpot() || {}).ref || null;
          if (sideRef) matchLook(sideRef, compact);
        }
      }
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
    setInterval(sync, 2000);
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
    const delBtn = h('button', { class: 'btn danger', onclick: askDelete, title: '選んだ会話をサービス上から削除します' }, '削除する');
    const reloadBtn = h('button', { class: 'btn', onclick: loadList }, '再読み込み');
    const barFill = h('div');
    const status = h('div', { class: 'status' });

    const overlay = h(
      'div',
      { class: 'overlay', onclick: (e) => e.target === overlay && close() },
      h(
        'div',
        { class: 'panel' },
        h('div', { class: 'head' }, h('h2', {}, `${api.platform} の会話を一括保存`), h('button', { class: 'x', title: '閉じる', onclick: close }, '×')),
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
            h('label', {}, html, `HTML（${api.platform}風の見た目）`),
            h('span', { class: 'spacer' }),
            count,
            stopBtn,
            api.deleteConversation ? delBtn : null,
            saveBtn
          ),
          h('div', { class: 'bar' }, barFill),
          status
        )
      )
    );
    return { overlay, panel: overlay.firstChild, list, count, md, html, saveBtn, stopBtn, delBtn, reloadBtn, barFill, status, search };
  }

  function open() {
    // ChatGPT などは読み込み途中に画面を作り直し、パネルの入れ物を消すことがある。消えていたら付け直す
    if (!rootHost.isConnected) {
      document.body.append(rootHost);
      log('パネルの入れ物を付け直し');
    }
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
    ui.delBtn.disabled = busy;
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

  const visible = () => state.convs.filter((c) => !state.filter || `${c.title} ${c.tag || ''}`.toLowerCase().includes(state.filter));

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
      return h('label', { class: 'row' }, cb, h('span', { class: 't', title: c.title }, c.title || '(無題)'), c.tag ? h('span', { class: 'tag', title: c.tag }, c.tag) : null, h('span', { class: 'd' }, ex.formatDate(c.time, false)));
    });
    ui.list.replaceChildren(...(rows.length ? rows : [h('div', { class: 'empty' }, state.busy ? '読み込み中…' : '会話がありません')]));
    updateCount();
  }

  // 再試行中も「何をしている途中か」が分かるように、元の表示に追記する
  let statusBase = '';
  const progress = (text) => setStatus((statusBase = text));
  const retryNote = (e, wait, n, max) =>
    setStatus(`${statusBase}\n通信エラー（${e.message}）。${Math.round(wait / 1000)}秒後に再試行します（${n}/${max}回目）`, true);

  function updateReloadLabel() {
    ui.reloadBtn.textContent = state.listResume ? '続きを読み込む' : '再読み込み';
  }

  async function loadList() {
    const resume = state.listResume;
    state.ctl = { aborted: false };
    setBusy(true);
    setBar(0);
    if (!resume) {
      state.convs = [];
      renderList();
    }
    try {
      const result = await api.listConversations({
        ctl: state.ctl,
        resume,
        onProgress: (n) => progress(`会話一覧を読み込み中… ${n} 件`),
        onRetry: retryNote,
      });
      state.listResume = result.resume;
      const known = new Set(result.items.map((c) => c.id));
      const extra = sidebarConversations().filter((c) => !known.has(c.id));
      const prevChecked = state.checked;
      state.convs = result.items.concat(extra).sort((a, b) => b.time - a.time);
      state.checked = new Set(state.convs.filter((c) => !resume || prevChecked.has(c.id) || !state.knownIds.has(c.id)).map((c) => c.id));
      state.knownIds = new Set(state.convs.map((c) => c.id));
      let msg = `${state.convs.length} 件の会話が見つかりました。`;
      if (extra.length) msg += `（うちサイドバーから補完 ${extra.length} 件）`;
      if (result.error) {
        msg += `\n一覧の読み込みが途中で止まりました（${result.error.message}）。`;
        msg += `\n「続きを読み込む」で、止まった所から再開できます。`;
      }
      setStatus(msg, !!result.error);
    } catch (e) {
      setStatus(`一覧を取得できません: ${e.message}`, true);
    } finally {
      setBusy(false);
      updateReloadLabel();
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

  const selected = () => state.convs.filter((c) => state.checked.has(c.id));
  const formatError = () => (!ui.md.checked && !ui.html.checked ? '保存形式を1つ以上選んでください。' : '');

  async function save() {
    const targets = selected();
    if (!targets.length) return setStatus('保存する会話を選んでください。', true);
    if (formatError()) return setStatus(formatError(), true);
    state.ctl = { aborted: false };
    setBusy(true);
    try {
      await exportConvs(targets);
    } finally {
      setBusy(false);
    }
  }

  // 会話を取得して ZIP で保存する。戻り値: 保存できた会話の id の Set
  async function exportConvs(targets) {
    const wantMd = ui.md.checked;
    const wantHtml = ui.html.checked;
    const files = [];
    const entries = [];
    let failed = [];
    const used = new Set();
    const started = Date.now();
    let done = 0;

    const fetchOne = async (c, label) => {
      progress(label);
      const turns = await api.getTurns(c.id, { ctl: state.ctl, onRetry: retryNote });
      if (!turns.length) throw new Error('本文が空でした');
      const base = ex.fileBase(c, used);
      if (wantMd) files.push({ name: `markdown/${base}.md`, data: ex.toMarkdown(c, turns) });
      if (wantHtml) files.push({ name: `html/${base}.html`, data: ex.toHtml(c, turns) });
      entries.push({ conv: c, base });
    };

    {
      // 1周目: 全件を順に取得。失敗しても止まらず次へ進む
      for (const c of targets) {
        if (state.ctl.aborted) break;
        const left = done ? Math.ceil((((Date.now() - started) / done) * (targets.length - done)) / 60000) : null;
        try {
          await fetchOne(c, `保存中 ${done + 1} / ${targets.length}：${c.title || '(無題)'}${left ? `\n残り約 ${left} 分` : ''}`);
        } catch (e) {
          if (e instanceof ACS.AbortedError) break;
          failed.push({ c, e });
        }
        done++;
        setBar(done / targets.length);
      }

      // 2周目: 失敗した会話だけ、少し間を空けてもう一度挑戦する
      if (failed.length && !state.ctl.aborted) {
        const retry = failed;
        failed = [];
        try {
          progress(`${retry.length} 件の取得に失敗しました。30秒後に再挑戦します…`);
          await ACS.sleep(30000, state.ctl);
          for (let i = 0; i < retry.length; i++) {
            const { c } = retry[i];
            try {
              await fetchOne(c, `再挑戦 ${i + 1} / ${retry.length}：${c.title || '(無題)'}`);
            } catch (e) {
              if (e instanceof ACS.AbortedError) throw e;
              failed.push({ c, e });
            }
          }
        } catch (e) {
          if (!(e instanceof ACS.AbortedError)) throw e;
          const ok = new Set(entries.map((x) => x.conv.id));
          failed = failed.concat(retry.filter((x) => !ok.has(x.c.id) && !failed.some((f) => f.c.id === x.c.id)));
        }
      }

      if (!entries.length) {
        setStatus(state.ctl.aborted ? '中止しました。保存した会話はありません。' : '保存できた会話がありません。', true);
        return new Set();
      }
      entries.sort((a, b) => b.conv.time - a.conv.time);
      if (wantHtml) files.push({ name: 'index.html', data: ex.indexHtml(entries, api.platform) });
      if (failed.length) {
        const lines = failed.map(({ c, e }) => `${c.title || '(無題)'}\t${c.url}\t${e.message}`);
        files.push({ name: 'errors.txt', data: 'タイトル\tURL\t理由\n' + lines.join('\n') + '\n' });
      }

      download(ACS.makeZip(files), `${api.platform.toLowerCase()}_export_${ex.stamp()}.zip`);
      let msg = `${entries.length} 件を保存しました。`;
      if (state.ctl.aborted) msg = `中止しました。それまでの ${entries.length} 件を保存しました。`;
      if (failed.length) msg += `\n${failed.length} 件は2回挑戦しても取得できませんでした（ZIP内の errors.txt を参照）。`;
      setStatus(msg, failed.length > 0);
      return new Set(entries.map((x) => x.conv.id));
    }
  }

  // ---- 削除 ----

  // 確認画面。選択肢: キャンセル / 削除のみ / 保存してから削除
  function askDelete() {
    const targets = selected();
    if (!targets.length) return setStatus('削除する会話を選んでください。', true);
    const shown = targets.slice(0, 5);
    const back = h('div', { class: 'dlg-back' });
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      closeDlg();
    };
    const closeDlg = () => {
      back.remove();
      document.removeEventListener('keydown', onKey, true);
    };
    const choose = (withSave) => () => {
      if (withSave && formatError()) return alert(formatError());
      closeDlg();
      runDelete(targets, withSave);
    };
    const cancel = h('button', { class: 'btn', onclick: closeDlg }, 'キャンセル');
    back.append(
      h(
        'div',
        { class: 'dlg', role: 'dialog' },
        h('h3', {}, `${targets.length} 件の会話を ${api.platform} から削除します`),
        h(
          'ul',
          {},
          shown.map((c) => h('li', { title: c.title }, c.title || '(無題)')),
          targets.length > shown.length ? h('li', {}, `ほか ${targets.length - shown.length} 件`) : null
        ),
        h('div', { class: 'warn' }, '削除した会話は元に戻せません。心配な場合は「保存してから削除」を選んでください（保存に失敗した会話は削除しません）。'),
        h(
          'div',
          { class: 'btns' },
          cancel,
          h('button', { class: 'btn danger', onclick: choose(false) }, '削除のみ'),
          h('button', { class: 'btn primary', onclick: choose(true) }, '保存してから削除')
        )
      )
    );
    back.addEventListener('click', (e) => e.target === back && closeDlg());
    document.addEventListener('keydown', onKey, true);
    ui.panel.append(back);
    cancel.focus();
  }

  async function runDelete(targets, withSave) {
    state.ctl = { aborted: false };
    setBusy(true);
    try {
      let list = targets;
      let saveMsg = '';
      if (withSave) {
        const saved = await exportConvs(targets);
        saveMsg = ui.status.textContent;
        list = targets.filter((c) => saved.has(c.id));
        if (state.ctl.aborted || !list.length) {
          setStatus(`${saveMsg}\n削除は行いませんでした。`, true);
          return;
        }
      }
      setBar(0);
      const deleted = new Set();
      const failed = [];
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (state.ctl.aborted) break;
        progress(`削除中 ${i + 1} / ${list.length}：${c.title || '(無題)'}`);
        try {
          await api.deleteConversation(c.id, { ctl: state.ctl, onRetry: retryNote });
          deleted.add(c.id);
        } catch (e) {
          if (e instanceof ACS.AbortedError) break;
          failed.push({ c, e });
        }
        setBar((i + 1) / list.length);
      }
      state.convs = state.convs.filter((c) => !deleted.has(c.id));
      for (const id of deleted) {
        state.checked.delete(id);
        state.knownIds.delete(id);
      }
      let msg = saveMsg ? saveMsg + '\n' : '';
      msg += state.ctl.aborted ? `削除を中止しました。それまでの ${deleted.size} 件を削除しました。` : `${deleted.size} 件を削除しました。`;
      if (list.length < targets.length) msg += `\n保存できなかった ${targets.length - list.length} 件は削除していません。`;
      if (failed.length) {
        msg += `\n${failed.length} 件は削除できませんでした（${failed[0].e.message}）。選択したまま残しています。`;
        log('削除に失敗', failed);
      }
      if (deleted.size) msg += '\nサイドバーの表示は、ページを再読み込みすると更新されます。';
      setStatus(msg, failed.length > 0 || state.ctl.aborted);
    } finally {
      setBusy(false);
      renderList();
    }
  }

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();

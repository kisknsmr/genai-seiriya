// Gemini の内部 API（batchexecute）から会話一覧と本文を取得する。
// 仕様メモ: ai-toolbox-source/NOTES.md
(() => {
  const ACS = (window.ACS = window.ACS || {});

  const ORIGIN = 'https://gemini.google.com';
  const MIN_INTERVAL_MS = 1300; // 1分あたり約45回まで（制限は約50回/分）
  const MAX_TRIES = 5;

  let lastCall = 0;
  let reqId = 100000 + Math.floor(Math.random() * 90000);
  let cached = null;

  class AbortedError extends Error {
    constructor() {
      super('中止しました');
      this.name = 'AbortedError';
    }
  }

  // ctl = { aborted: boolean }。中止ボタンで aborted を true にする
  function sleep(ms, ctl) {
    return new Promise((resolve, reject) => {
      const end = Date.now() + ms;
      const tick = () => {
        if (ctl && ctl.aborted) return reject(new AbortedError());
        const left = end - Date.now();
        if (left <= 0) return resolve();
        setTimeout(tick, Math.min(left, 250));
      };
      tick();
    });
  }

  function extract(text) {
    const get = (key) => {
      const m = text.match(new RegExp(key + '["\\s]*:["\\s]*"([^"]+)"'));
      return m && m[1];
    };
    const at = get('SNlM0e');
    const sid = get('FdrFJe');
    const bl = get('cfb2h');
    return at && sid && bl ? { at, sid, bl } : null;
  }

  async function pageData(force) {
    if (cached && !force) return cached;
    let d = null;
    if (!force) {
      for (const s of document.scripts) {
        const t = s.textContent;
        if (t && t.includes('SNlM0e') && (d = extract(t))) break;
      }
    }
    if (!d) {
      const r = await fetch(ORIGIN + '/app', { credentials: 'include' });
      d = extract(await r.text());
    }
    if (!d) throw new Error('Gemini のページ情報を取得できません。ログイン状態を確認してください。');
    return (cached = d);
  }

  function parseResponse(text, id) {
    const lines = text.replace(/^\)\]\}'\n?/, '').split('\n');
    for (const ln of lines) {
      const s = ln.trim();
      if (!s || /^\d+$/.test(s)) continue;
      let j;
      try {
        j = JSON.parse(s);
      } catch {
        continue;
      }
      if (!Array.isArray(j)) continue;
      for (const n of j) {
        if (Array.isArray(n) && n[0] === 'wrb.fr' && n[1] === id && typeof n[2] === 'string') return JSON.parse(n[2]);
      }
    }
    throw new Error(`応答にデータがありません (${id})`);
  }

  async function rpcOnce(id, payload, path, ctl) {
    const wait = lastCall + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait, ctl);
    lastCall = Date.now();

    const d = await pageData();
    const params = new URLSearchParams({
      rpcids: id,
      'source-path': path,
      bl: d.bl,
      'f.sid': d.sid,
      hl: 'ja',
      _reqid: String(reqId++),
      rt: 'c',
    });
    const body =
      `f.req=${encodeURIComponent(JSON.stringify([[[id, payload, null, 'generic']]]))}` +
      `&at=${encodeURIComponent(d.at)}`;
    const r = await fetch(`${ORIGIN}/_/BardChatUi/data/batchexecute?${params}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'X-Same-Domain': '1' },
      credentials: 'include',
      body,
    });
    if (!r.ok) {
      const e = new Error(`HTTP ${r.status}`);
      e.status = r.status;
      throw e;
    }
    return parseResponse(await r.text(), id);
  }

  // 失敗したら待って再試行する（以前は1回の失敗で打ち切っていた → 470件止まりの一因）
  async function rpc(id, payload, path, ctl, onRetry) {
    let lastErr;
    for (let i = 0; i < MAX_TRIES; i++) {
      if (ctl && ctl.aborted) throw new AbortedError();
      try {
        return await rpcOnce(id, payload, path, ctl);
      } catch (e) {
        if (e instanceof AbortedError) throw e;
        lastErr = e;
        if (i === MAX_TRIES - 1) break;
        const wait = e.status === 429 ? 60000 : 2000 * 2 ** i;
        if (onRetry) onRetry(e, wait);
        await sleep(wait, ctl);
        if ([400, 401, 403].includes(e.status)) {
          try {
            await pageData(true); // トークン切れの可能性 → 取り直す
          } catch {}
        }
      }
    }
    throw lastErr;
  }

  function nextToken(r) {
    if (!Array.isArray(r)) return null;
    if (typeof r[1] === 'string') return r[1] || null;
    for (let i = 0; i < r.length; i++) {
      if (i === 1 || i === 2) continue;
      if (typeof r[i] === 'string' && r[i].length >= 40) return r[i];
    }
    return null;
  }

  const toId = (id) => (id.startsWith('c_') ? id : 'c_' + id);
  const urlOf = (id) => `${ORIGIN}/app/${id.replace(/^c_/, '')}`;

  function conv(id, title, timeSec) {
    return {
      id: toId(id),
      title: (title || '').trim(),
      time: timeSec ? timeSec * 1000 : 0,
      url: urlOf(id),
      platform: 'Gemini',
    };
  }

  // 戻り値: { items, error }。途中で失敗しても、取れた分は返す
  async function listConversations({ ctl, onProgress, onRetry } = {}) {
    const items = [];
    const seen = new Set();
    let tok = null;
    let emptyStreak = 0;
    try {
      for (let page = 0; page < 2000; page++) {
        const payload = tok === null ? '[]' : JSON.stringify([20, tok, [0, null, 1]]);
        const r = await rpc('MaZiqc', payload, '/app', ctl, onRetry);
        let added = 0;
        const arr = Array.isArray(r) ? r[2] : null;
        if (Array.isArray(arr)) {
          for (const c of arr) {
            if (!Array.isArray(c) || typeof c[0] !== 'string' || !c[0]) continue;
            const id = toId(c[0]);
            if (seen.has(id)) continue;
            seen.add(id);
            items.push(conv(id, typeof c[1] === 'string' ? c[1] : '', Array.isArray(c[5]) ? c[5][0] : 0));
            added++;
          }
        }
        if (onProgress) onProgress(items.length);
        const next = nextToken(r);
        if (!next || next === tok) break;
        emptyStreak = added === 0 ? emptyStreak + 1 : 0;
        if (emptyStreak >= 3) break;
        tok = next;
      }
      return { items, error: null };
    } catch (e) {
      if (e instanceof AbortedError) throw e;
      return { items, error: e };
    }
  }

  // サイドバーに表示済みの会話（API一覧の取りこぼし補完用）
  function sidebarConversations() {
    const out = [];
    const seen = new Set();
    for (const a of document.querySelectorAll('a[href*="/app/"]')) {
      const m = (a.getAttribute('href') || '').match(/\/app\/([0-9a-f]{8,})/i);
      if (!m || seen.has(m[1])) continue;
      seen.add(m[1]);
      const titleEl = a.querySelector('.conversation-title') || a;
      out.push(conv(m[1], titleEl.textContent, 0));
    }
    return out;
  }

  function modelText(o) {
    if (!Array.isArray(o) || !Array.isArray(o[0])) return null;
    const e = o[0][1];
    if (typeof e === 'string') return e.trim() ? e : null;
    if (Array.isArray(e) && typeof e[0] === 'string' && e[0].trim()) return e[0];
    return null;
  }

  function parseTurns(r) {
    const out = [];
    if (!Array.isArray(r) || !Array.isArray(r[0])) return out;
    const list = r[0]; // 新しい順 → 古い順に並べ直す
    for (let i = list.length - 1; i >= 0; i--) {
      const x = list[i];
      if (!Array.isArray(x)) continue;
      const a = x[2];
      let u = null;
      if (Array.isArray(a) && Array.isArray(a[0]) && typeof a[0][0] === 'string') u = a[0][0];
      else if (Array.isArray(a) && typeof a[0] === 'string') u = a[0];
      if (u && u.trim()) out.push({ role: 'user', text: u });
      const m = Array.isArray(x[3]) ? modelText(x[3][0]) : null;
      if (m) out.push({ role: 'model', text: m });
    }
    return out;
  }

  async function getTurns(id, { ctl, onRetry } = {}) {
    const cid = toId(id);
    const path = '/app/' + cid.replace(/^c_/, '');
    let all = [];
    let tok = null;
    const seen = new Set();
    for (let k = 0; k < 200; k++) {
      const r = await rpc('hNvQHb', JSON.stringify([cid, 100000, tok, 1, [0], [4], null, 1]), path, ctl, onRetry);
      all = parseTurns(r).concat(all);
      const nt = Array.isArray(r) && typeof r[1] === 'string' && r[1] ? r[1] : null;
      if (!nt || seen.has(nt)) break;
      seen.add(nt);
      tok = nt;
    }
    return all;
  }

  ACS.AbortedError = AbortedError;
  ACS.sleep = sleep;
  ACS.gemini = { listConversations, sidebarConversations, getTurns, platform: 'Gemini' };
})();

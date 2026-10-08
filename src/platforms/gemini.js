// Gemini の内部 API（batchexecute）から会話一覧と本文を取得する。
// 仕様メモ: ai-toolbox-source/NOTES.md
(() => {
  const ACS = window.ACS;
  const { HttpError, fatal } = ACS.net;

  const ORIGIN = 'https://gemini.google.com';
  // 複数の Google アカウントを使い分けている時は URL が /u/1/app のようになる。
  // その番号を付けて送らないと、別のアカウント（/u/0）の会話を操作してしまう
  const userPath = () => {
    const m = location.pathname.match(/^\/u\/(\d+)\//);
    return m ? `/u/${m[1]}` : '';
  };

  let reqId = 100000 + Math.floor(Math.random() * 90000);
  let cached = null;

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
      const r = await fetch(ORIGIN + userPath() + '/app', { credentials: 'include' });
      d = extract(await r.text());
    }
    if (!d) throw fatal('Gemini のページ情報を取得できません。ログイン状態を確認してください。');
    return (cached = d);
  }

  // 1分あたり約45回まで（制限は約50回/分）
  const client = ACS.net.createClient({ minIntervalMs: 1300, onAuthError: () => pageData(true) });

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
        if (!Array.isArray(n) || n[0] !== 'wrb.fr' || n[1] !== id) continue;
        // データ部分が空 = 一覧の最後のページなど。エラーではなく「中身なし」として返す
        return typeof n[2] === 'string' ? JSON.parse(n[2]) : null;
      }
    }
    throw new Error(`応答にデータがありません (${id})`);
  }

  // raw = true のときは応答の中身を読まず、成功したかだけを見る（削除など）
  function rpc(id, payload, path, opt, raw = false) {
    return client.call(async () => {
      const d = await pageData();
      const params = new URLSearchParams({
        rpcids: id,
        'source-path': userPath() + path,
        bl: d.bl,
        'f.sid': d.sid,
        hl: 'ja',
        _reqid: String(reqId++),
        rt: 'c',
      });
      const body =
        `f.req=${encodeURIComponent(JSON.stringify([[[id, payload, null, 'generic']]]))}` +
        `&at=${encodeURIComponent(d.at)}`;
      const r = await fetch(`${ORIGIN}${userPath()}/_/BardChatUi/data/batchexecute?${params}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'X-Same-Domain': '1' },
        credentials: 'include',
        body,
      });
      if (!r.ok) throw new HttpError(r.status);
      return raw ? true : parseResponse(await r.text(), id);
    }, opt);
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

  function makeConv(id, title, time) {
    return {
      id: toId(id),
      title: (title || '').trim(),
      time: ACS.net.toMs(time),
      url: `${ORIGIN}${userPath()}/app/${id.replace(/^c_/, '')}`,
      platform: 'Gemini',
      tag: '',
    };
  }

  // 戻り値: { items, error, resume }。途中で失敗しても、取れた分と「続きの位置」を返す
  // resume を渡すと、前回止まった所から続きを読み込む
  async function listConversations({ ctl, onProgress, onRetry, resume } = {}) {
    const items = resume ? resume.items.slice() : [];
    const seen = new Set(items.map((c) => c.id));
    let tok = resume ? resume.tok : null;
    let emptyStreak = 0;
    try {
      for (let page = 0; page < 2000; page++) {
        const payload = tok === null ? '[]' : JSON.stringify([20, tok, [0, null, 1]]);
        const r = await rpc('MaZiqc', payload, '/app', { ctl, onRetry });
        let added = 0;
        const arr = Array.isArray(r) ? r[2] : null;
        if (Array.isArray(arr)) {
          for (const c of arr) {
            if (!Array.isArray(c) || typeof c[0] !== 'string' || !c[0]) continue;
            const id = toId(c[0]);
            if (seen.has(id)) continue;
            seen.add(id);
            items.push(makeConv(id, typeof c[1] === 'string' ? c[1] : '', Array.isArray(c[5]) ? c[5][0] : 0));
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
      return { items, error: null, resume: null };
    } catch (e) {
      return { items, error: e, resume: { items, tok } };
    }
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

  async function getTurns(id, opt = {}) {
    const cid = toId(id);
    const path = '/app/' + cid.replace(/^c_/, '');
    let all = [];
    let tok = null;
    const seen = new Set();
    for (let k = 0; k < 200; k++) {
      const r = await rpc('hNvQHb', JSON.stringify([cid, 100000, tok, 1, [0], [4], null, 1]), path, opt);
      all = parseTurns(r).concat(all);
      const nt = Array.isArray(r) && typeof r[1] === 'string' && r[1] ? r[1] : null;
      if (!nt || seen.has(nt)) break;
      seen.add(nt);
      tok = nt;
    }
    return all;
  }

  // 画面の「削除」と同じ内部 API（GzXR5e）を呼ぶ
  async function deleteConversation(id, opt = {}) {
    await rpc('GzXR5e', JSON.stringify([toId(id)]), '/app', opt, true);
  }

  ACS.platforms['gemini.google.com'] = {
    platform: 'Gemini',
    sidebarSelector: 'conversations-list',
    linkRe: /\/app\/([0-9a-f]{8,})/i,
    linkTitle: (a) => (a.querySelector('.conversation-title') || a).textContent,
    makeConv: (id, title) => makeConv(id, title, 0),
    listConversations,
    getTurns,
    deleteConversation,
  };
})();

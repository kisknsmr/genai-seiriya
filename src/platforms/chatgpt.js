// ChatGPT の会話一覧と本文を取得する。
// 一覧は「通常 → アーカイブ → プロジェクト内」の順に読み込む。
(() => {
  const ACS = window.ACS;
  const { fatal, fetchOk, fetchJson, toMs } = ACS.net;

  const ORIGIN = 'https://chatgpt.com';
  const PAGE = 100;

  let token = null;

  // ログイン中の「通行証（アクセストークン）」を取得する
  async function auth(force) {
    if (token && !force) return token;
    const r = await fetch(ORIGIN + '/api/auth/session', { credentials: 'include' });
    const j = r.ok ? await r.json() : null;
    if (!j || !j.accessToken) throw fatal('ChatGPT にログインしていません。ログインしてから再度お試しください。');
    return (token = j.accessToken);
  }

  function headers() {
    const h = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
    // チーム（ワークスペース）利用時は、どのワークスペースかを伝える
    const m = document.cookie.match(/(?:^|;\s*)_account=([^;]+)/);
    if (m && m[1] && m[1] !== 'personal') h['ChatGPT-Account-Id'] = decodeURIComponent(m[1]);
    return h;
  }

  const client = ACS.net.createClient({ minIntervalMs: 1000, onAuthError: () => auth(true) });

  function get(path, opt) {
    return client.call(async () => {
      await auth();
      return fetchJson(ORIGIN + path, { headers: headers() });
    }, opt);
  }

  function makeConv(id, title, time, tag = '') {
    return {
      id,
      title: (title || '').trim(),
      time: toMs(time),
      url: `${ORIGIN}/c/${id}`,
      platform: 'ChatGPT',
      tag,
    };
  }

  // 戻り値: { items, error, resume }
  // stage 0: 通常の会話 / 1: アーカイブ / 2: プロジェクト内 / 3: 完了
  async function listConversations({ ctl, onProgress, onRetry, resume } = {}) {
    const st = resume
      ? { ...resume, items: resume.items.slice() }
      : { items: [], stage: 0, offset: 0, gizmos: null, gi: 0, cursor: null };
    const seen = new Set(st.items.map((c) => c.id));
    const add = (it, tag) => {
      if (!it || !it.id || seen.has(it.id)) return;
      seen.add(it.id);
      st.items.push(makeConv(it.id, it.title, it.create_time || it.update_time, tag));
    };
    const opt = { ctl, onRetry };

    try {
      while (st.stage <= 1) {
        const archived = st.stage === 1;
        const d = await get(
          `/backend-api/conversations?offset=${st.offset}&limit=${PAGE}&order=updated&is_archived=${archived}`,
          opt
        );
        const arr = Array.isArray(d && d.items) ? d.items : [];
        for (const it of arr) add(it, archived ? 'アーカイブ' : '');
        if (onProgress) onProgress(st.items.length);
        st.offset += arr.length;
        const total = d && typeof d.total === 'number' ? d.total : null;
        const done = !arr.length || (total !== null ? st.offset >= total : arr.length < PAGE);
        if (done) {
          st.stage++;
          st.offset = 0;
        }
      }

      if (st.stage === 2) {
        try {
          if (!st.gizmos) {
            const found = [];
            let cur = null;
            for (let k = 0; k < 100; k++) {
              const q = `owned_only=true&conversations_per_gizmo=0${cur ? `&cursor=${encodeURIComponent(cur)}` : ''}`;
              const d = await get(`/backend-api/gizmos/snorlax/sidebar?${q}`, opt);
              for (const it of (d && d.items) || []) {
                const g = (it.gizmo && it.gizmo.gizmo) || it.gizmo || it;
                if (g && g.id) found.push({ id: g.id, name: (g.display && g.display.name) || '' });
              }
              if (!d || !d.cursor || d.cursor === cur) break;
              cur = d.cursor;
            }
            st.gizmos = found;
          }
          while (st.gi < st.gizmos.length) {
            const g = st.gizmos[st.gi];
            const d = await get(`/backend-api/gizmos/${g.id}/conversations?cursor=${encodeURIComponent(st.cursor || '0')}`, opt);
            const arr = (d && d.items) || [];
            for (const it of arr) add(it, `プロジェクト: ${g.name}`);
            if (onProgress) onProgress(st.items.length);
            if (arr.length && d.cursor && d.cursor !== st.cursor) st.cursor = d.cursor;
            else {
              st.gi++;
              st.cursor = null;
            }
          }
        } catch (e) {
          if (e.status !== 404) throw e; // プロジェクト機能が無いアカウントは飛ばす
        }
        st.stage = 3;
      }
      return { items: st.items, error: null, resume: null };
    } catch (e) {
      return { items: st.items, error: e, resume: st };
    }
  }

  const SKIP_TYPES = new Set([
    'thoughts',
    'reasoning_recap',
    'user_editable_context',
    'model_editable_context',
    'system_error',
    'tether_browsing_display',
    'tether_quote',
  ]);

  // 引用マーカー（画面では出典リンクとして表示される記号）を取り除く
  function clean(text) {
    return text
      .replace(/[^]*/g, '')
      .replace(/[-]/g, '')
      .replace(/【\d+(?::\d+)?†[^】]*】/g, '');
  }

  function fence(code, lang) {
    const f = code.includes('```') ? '````' : '```';
    return `${f}${lang || ''}\n${code}\n${f}`;
  }

  function messageText(m) {
    const c = m.content;
    if (!c || SKIP_TYPES.has(c.content_type)) return '';
    if (c.content_type === 'code') {
      return typeof c.text === 'string' ? fence(c.text, c.language && c.language !== 'unknown' ? c.language : '') : '';
    }
    if (c.content_type === 'execution_output') return typeof c.text === 'string' ? fence(c.text, '') : '';
    if (Array.isArray(c.parts)) {
      return c.parts
        .map((p) => {
          if (typeof p === 'string') return p;
          if (p && p.content_type === 'image_asset_pointer') return '[画像]';
          if (p && p.content_type === 'audio_transcription' && p.text) return p.text;
          return p && typeof p.text === 'string' ? p.text : '';
        })
        .filter(Boolean)
        .join('\n');
    }
    return typeof c.text === 'string' ? c.text : '';
  }

  async function getTurns(id, opt = {}) {
    const d = await get(`/backend-api/conversation/${id}`, opt);
    const map = (d && d.mapping) || {};

    // 枝分かれした会話は「最後に表示していた流れ」をたどる
    let chain = [];
    const guard = new Set();
    for (let n = d && d.current_node; n && map[n] && !guard.has(n); n = map[n].parent) {
      guard.add(n);
      chain.push(map[n]);
    }
    chain.reverse();
    if (!chain.length) {
      chain = Object.values(map).sort((a, b) => toMs(a.message && a.message.create_time) - toMs(b.message && b.message.create_time));
    }

    const turns = [];
    for (const node of chain) {
      const m = node && node.message;
      if (!m || !m.author) continue;
      const role = m.author.role === 'user' ? 'user' : m.author.role === 'assistant' ? 'model' : null;
      if (!role) continue;
      const meta = m.metadata || {};
      if (meta.is_visually_hidden_from_conversation) continue;
      // ツールへの指示（検索クエリ等）は省く。Python のコードだけは残す
      if (role === 'model' && m.recipient && m.recipient !== 'all' && m.recipient !== 'python') continue;

      let text = clean(messageText(m)).trim();
      if (role === 'user' && Array.isArray(meta.attachments) && meta.attachments.length) {
        const names = meta.attachments.map((a) => a.name).filter(Boolean);
        if (names.length) text = `${text}\n\n📎 ${names.join(', ')}`.trim();
      }
      if (!text) continue;

      const prev = turns[turns.length - 1];
      if (prev && prev.role === role && role === 'model') prev.text += '\n\n' + text;
      else turns.push({ role, text });
    }
    return turns;
  }

  // 画面の「削除」と同じ操作（非表示にする＝ChatGPT 上では削除扱い）。
  // 既に消えている会話（404）は削除済みとみなす
  async function deleteConversation(id, opt = {}) {
    try {
      await client.call(async () => {
        await auth();
        await fetchOk(`${ORIGIN}/backend-api/conversation/${id}`, {
          method: 'PATCH',
          headers: { ...headers(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_visible: false }),
        });
      }, opt);
    } catch (e) {
      if (e.status !== 404) throw e;
    }
  }

  ACS.platforms['chatgpt.com'] = {
    platform: 'ChatGPT',
    sidebarSelector: '#history',
    linkRe: /\/c\/([0-9a-f-]{36})/i,
    makeConv: (id, title) => makeConv(id, title, 0),
    listConversations,
    getTurns,
    deleteConversation,
  };
})();

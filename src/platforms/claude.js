// Claude の会話一覧と本文を取得する。
// まず自分の組織ID（アカウント番号）を調べ、そこから一覧と本文を取る。
(() => {
  const ACS = window.ACS;
  const { fatal, fetchOk, fetchJson, toMs } = ACS.net;

  const ORIGIN = 'https://claude.ai';
  const PAGE = 100;

  let org = null;

  async function getOrg() {
    if (org) return org;
    const m = document.cookie.match(/(?:^|;\s*)lastActiveOrg=([^;]+)/);
    if (m && m[1]) return (org = decodeURIComponent(m[1]));
    const list = await fetchJson(ORIGIN + '/api/organizations', { headers: { Accept: 'application/json' } });
    const orgs = Array.isArray(list) ? list : [];
    const pick = orgs.find((o) => Array.isArray(o.capabilities) && o.capabilities.includes('chat')) || orgs[0];
    if (!pick || !pick.uuid) throw fatal('Claude のアカウント情報を取得できません。ログイン状態を確認してください。');
    return (org = pick.uuid);
  }

  const client = ACS.net.createClient({
    minIntervalMs: 1000,
    onAuthError: () => {
      org = null;
    },
  });

  function get(path, opt) {
    return client.call(async () => {
      const o = await getOrg();
      return fetchJson(`${ORIGIN}/api/organizations/${o}${path}`, { headers: { Accept: 'application/json' } });
    }, opt);
  }

  function makeConv(id, title, time, tag = '') {
    return {
      id,
      title: (title || '').trim(),
      time: toMs(time),
      url: `${ORIGIN}/chat/${id}`,
      platform: 'Claude',
      tag,
    };
  }

  const pickArray = (d) =>
    Array.isArray(d)
      ? d
      : (d && ['data', 'conversations', 'items', 'results', 'chat_conversations'].map((k) => d[k]).find(Array.isArray)) || [];

  // 戻り値: { items, error, resume }
  async function listConversations({ ctl, onProgress, onRetry, resume } = {}) {
    const st = resume ? { ...resume, items: resume.items.slice() } : { items: [], offset: 0 };
    const seen = new Set(st.items.map((c) => c.id));
    const add = (it) => {
      if (!it || !it.uuid || seen.has(it.uuid)) return;
      seen.add(it.uuid);
      const tag = it.project && it.project.name ? `プロジェクト: ${it.project.name}` : '';
      st.items.push(makeConv(it.uuid, it.name, it.created_at || it.updated_at, tag));
    };
    const opt = { ctl, onRetry };

    try {
      for (let k = 0; k < 1000; k++) {
        let d;
        try {
          d = await get(`/chat_conversations_v2?limit=${PAGE}&offset=${st.offset}&consistency=eventual`, opt);
        } catch (e) {
          if (e.status !== 404 || st.offset !== 0) throw e;
          d = await get('/chat_conversations', opt); // 旧形式: 全件を一度に返す
          pickArray(d).forEach(add);
          break;
        }
        const arr = pickArray(d);
        arr.forEach(add);
        if (onProgress) onProgress(st.items.length);
        st.offset += arr.length;
        const hasMore = d && typeof d.has_more === 'boolean' ? d.has_more : arr.length >= PAGE;
        if (!arr.length || !hasMore) break;
      }
      if (onProgress) onProgress(st.items.length);
      return { items: st.items, error: null, resume: null };
    } catch (e) {
      return { items: st.items, error: e, resume: st };
    }
  }

  function fence(code, lang) {
    const f = code.includes('```') ? '````' : '```';
    return `${f}${lang || ''}\n${code}\n${f}`;
  }

  const ARTIFACT_LANG = {
    'text/markdown': 'markdown',
    'text/html': 'html',
    'image/svg+xml': 'svg',
    'application/vnd.ant.react': 'jsx',
    'application/vnd.ant.mermaid': 'mermaid',
  };

  function messageText(m) {
    if (!Array.isArray(m.content) || !m.content.length) return typeof m.text === 'string' ? m.text : '';
    const parts = [];
    for (const c of m.content) {
      if (!c) continue;
      if (c.type === 'text' && c.text) parts.push(c.text);
      else if (c.type === 'tool_use' && c.input) {
        const inp = c.input;
        // アーティファクト（Claude が作った文書やコード）は中身を残す
        if (c.name === 'artifacts' && typeof inp.content === 'string' && inp.content) {
          parts.push(`**📄 ${inp.title || 'Artifact'}**\n\n${fence(inp.content, inp.language || ARTIFACT_LANG[inp.type] || '')}`);
        } else if (c.name === 'create_file' && typeof inp.file_text === 'string') {
          parts.push(`**📄 ${inp.path || 'file'}**\n\n${fence(inp.file_text, '')}`);
        }
      }
    }
    return parts.join('\n\n');
  }

  async function getTurns(id, opt = {}) {
    const d = await get(`/chat_conversations/${id}?tree=True&rendering_mode=messages&render_all_tools=true`, opt);
    const msgs = Array.isArray(d && d.chat_messages) ? d.chat_messages : [];
    const byId = new Map(msgs.map((m) => [m.uuid, m]));

    // 枝分かれした会話は「最後に表示していた流れ」をたどる
    let chain = [];
    const guard = new Set();
    for (let cur = d && d.current_leaf_message_uuid; cur && byId.has(cur) && !guard.has(cur); cur = byId.get(cur).parent_message_uuid) {
      guard.add(cur);
      chain.push(byId.get(cur));
    }
    chain.reverse();
    if (!chain.length) chain = msgs.slice().sort((a, b) => (a.index || 0) - (b.index || 0));

    const turns = [];
    for (const m of chain) {
      const role = m.sender === 'human' ? 'user' : m.sender === 'assistant' ? 'model' : null;
      if (!role) continue;
      let text = messageText(m).trim();
      if (role === 'user') {
        const files = [...(m.attachments || []), ...(m.files_v2 || m.files || [])];
        const names = files.map((f) => f && (f.file_name || f.name)).filter(Boolean);
        if (names.length) text = `${text}\n\n📎 ${names.join(', ')}`.trim();
      }
      if (!text) continue;
      const prev = turns[turns.length - 1];
      if (prev && prev.role === role && role === 'model') prev.text += '\n\n' + text;
      else turns.push({ role, text });
    }
    return turns;
  }

  // 既に消えている会話（404）は削除済みとみなす
  async function deleteConversation(id, opt = {}) {
    try {
      await client.call(async () => {
        const o = await getOrg();
        await fetchOk(`${ORIGIN}/api/organizations/${o}/chat_conversations/${id}`, {
          method: 'DELETE',
          headers: { Accept: 'application/json' },
        });
      }, opt);
    } catch (e) {
      if (e.status !== 404) throw e;
    }
  }

  ACS.platforms['claude.ai'] = {
    platform: 'Claude',
    sidebarSelector: null,
    sidebarAfter: ['a[href="/recents"]', 'a[href="/new"]'], // 「チャット」→「新しいチャット」の順に探す
    linkRe: /\/chat\/([0-9a-f-]{36})/i,
    makeConv: (id, title) => makeConv(id, title, 0),
    listConversations,
    getTurns,
    deleteConversation,
  };
})();

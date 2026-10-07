// AI の回答（Markdown）を HTML に変換する簡易コンバーター。
// 見出し・リスト・表・コード・引用・太字/斜体/リンクに対応。
(() => {
  const ACS = (window.ACS = window.ACS || {});

  const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+/;
  const FENCE_RE = /^\s*(`{3,}|~{3,})\s*([\w+#.-]*)/;
  const HEADING_RE = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
  const HR_RE = /^\s*([-*_])(\s*\1){2,}\s*$/;
  const TABLE_SEP_RE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  const safeUrl = (u) => /^(https?:|mailto:)/i.test(u);

  function inline(text) {
    const codes = [];
    let s = text.replace(/`([^`\n]+)`/g, (_, c) => {
      codes.push(`<code>${esc(c)}</code>`);
      return `\u0000${codes.length - 1}\u0000`;
    });
    s = esc(s);
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, url) =>
      safeUrl(url) ? `<img alt="${alt}" src="${url}">` : m
    );
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) =>
      safeUrl(url) ? `<a href="${url}" target="_blank" rel="noopener">${label}</a>` : m
    );
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    s = s.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[Number(i)]);
  }

  const indentOf = (line) => line.match(/^\s*/)[0].length;

  function dedent(lines) {
    const ind = lines.filter((l) => l.trim()).map(indentOf);
    const min = ind.length ? Math.min(...ind) : 0;
    return lines.map((l) => l.slice(Math.min(min, indentOf(l))));
  }

  function isBlockStart(line, next) {
    return (
      FENCE_RE.test(line) ||
      HEADING_RE.test(line) ||
      HR_RE.test(line) ||
      LIST_RE.test(line) ||
      /^\s*>/.test(line) ||
      (line.includes('|') && next !== undefined && TABLE_SEP_RE.test(next))
    );
  }

  function splitRow(line) {
    return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  }

  function parseList(lines, start) {
    const first = LIST_RE.exec(lines[start]);
    const base = first[1].length;
    const ordered = /\d/.test(first[2]);
    const items = [];
    let i = start;

    while (i < lines.length) {
      const line = lines[i];
      const m = LIST_RE.exec(line);
      if (m && m[1].length === base) {
        items.push([line.slice(m[0].length)]);
        i++;
        continue;
      }
      if (!line.trim()) {
        let j = i + 1;
        while (j < lines.length && !lines[j].trim()) j++;
        if (j < lines.length && indentOf(lines[j]) > base) {
          for (let k = i; k < j; k++) items[items.length - 1].push('');
          i = j;
          continue;
        }
        const nm = j < lines.length ? LIST_RE.exec(lines[j]) : null;
        if (nm && nm[1].length === base) {
          i = j;
          continue;
        }
        break;
      }
      if (indentOf(line) > base) {
        items[items.length - 1].push(line);
        i++;
        continue;
      }
      if (isBlockStart(line, lines[i + 1])) break;
      items[items.length - 1].push(line); // 折り返しの続き
      i++;
    }

    const tag = ordered ? 'ol' : 'ul';
    const startAttr = ordered && parseInt(first[2], 10) !== 1 ? ` start="${parseInt(first[2], 10)}"` : '';
    const body = items
      .map(([head, ...rest]) => {
        const restHtml = rest.some((l) => l.trim()) ? render(dedent(rest).join('\n')) : '';
        return `<li>${inline(head)}${restHtml}</li>`;
      })
      .join('');
    return [`<${tag}${startAttr}>${body}</${tag}>`, i];
  }

  function render(src) {
    const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      const fence = FENCE_RE.exec(line);
      if (fence) {
        const mark = fence[1];
        const lang = fence[2];
        const body = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith(mark)) body.push(lines[i++]);
        i++;
        const cls = lang ? ` class="language-${esc(lang)}"` : '';
        const label = lang ? `<div class="code-lang">${esc(lang)}</div>` : '';
        out.push(`<div class="code">${label}<pre><code${cls}>${esc(body.join('\n'))}</code></pre></div>`);
        continue;
      }

      if (!line.trim()) {
        i++;
        continue;
      }

      const hm = HEADING_RE.exec(line);
      if (hm) {
        const lv = hm[1].length;
        out.push(`<h${lv}>${inline(hm[2])}</h${lv}>`);
        i++;
        continue;
      }

      if (HR_RE.test(line)) {
        out.push('<hr>');
        i++;
        continue;
      }

      if (line.includes('|') && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1])) {
        const head = splitRow(line);
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].trim() && lines[i].includes('|')) rows.push(splitRow(lines[i++]));
        const th = head.map((c) => `<th>${inline(c)}</th>`).join('');
        const tb = rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('');
        out.push(`<div class="table"><table><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table></div>`);
        continue;
      }

      if (/^\s*>/.test(line)) {
        const body = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ''));
        out.push(`<blockquote>${render(body.join('\n'))}</blockquote>`);
        continue;
      }

      if (LIST_RE.test(line)) {
        const [html, next] = parseList(lines, i);
        out.push(html);
        i = next;
        continue;
      }

      const para = [line.trim()];
      i++;
      while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i], lines[i + 1])) para.push(lines[i++].trim());
      out.push(`<p>${para.map(inline).join('<br>')}</p>`);
    }
    return out.join('\n');
  }

  ACS.markdown = { render, escape: esc };
})();

// 通信まわりの共通部品。全サービスで使う。
// - 間隔をあけて送る（各社の回数制限に引っかからないように）
// - 失敗したら待って再試行する（途中で諦めない）
(() => {
  const ACS = (window.ACS = window.ACS || {});

  class AbortedError extends Error {
    constructor() {
      super('中止しました');
      this.name = 'AbortedError';
    }
  }

  class HttpError extends Error {
    constructor(status) {
      super(`HTTP ${status}`);
      this.status = status;
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

  // 再試行しても無駄なエラー（ログインしていない等）は e.fatal = true で投げる
  function fatal(message) {
    const e = new Error(message);
    e.fatal = true;
    return e;
  }

  function createClient({ minIntervalMs = 1000, maxTries = 20, maxWaitMs = 60000, onAuthError } = {}) {
    let last = 0;
    async function call(fn, { ctl, onRetry } = {}) {
      let lastErr;
      for (let i = 0; i < maxTries; i++) {
        if (ctl && ctl.aborted) throw new AbortedError();
        const gap = last + minIntervalMs - Date.now();
        if (gap > 0) await sleep(gap, ctl);
        last = Date.now();
        try {
          return await fn();
        } catch (e) {
          if (e instanceof AbortedError || e.fatal || e.status === 404) throw e;
          lastErr = e;
          if (i === maxTries - 1) break;
          const wait = e.status === 429 ? e.retryAfterMs || maxWaitMs : Math.min(2000 * 2 ** i, maxWaitMs);
          if (onRetry) onRetry(e, wait, i + 1, maxTries);
          await sleep(wait, ctl);
          if (onAuthError && [400, 401, 403].includes(e.status)) {
            try {
              await onAuthError(e); // ログイン情報の期限切れかもしれない → 取り直す
            } catch {}
          }
        }
      }
      throw lastErr;
    }
    return { call };
  }

  async function fetchJson(url, init = {}) {
    const r = await fetch(url, { credentials: 'include', ...init });
    if (!r.ok) {
      const e = new HttpError(r.status);
      const ra = r.headers.get('retry-after');
      if (ra && /^\d+$/.test(ra)) e.retryAfterMs = Math.min(Number(ra) * 1000, 300000);
      throw e;
    }
    return r.json();
  }

  // 秒・ミリ秒・日付文字列のどれでもミリ秒にそろえる
  function toMs(v) {
    if (typeof v === 'number') return v < 1e12 ? v * 1000 : v;
    if (typeof v === 'string') return Date.parse(v) || 0;
    return 0;
  }

  ACS.net = { AbortedError, HttpError, sleep, fatal, createClient, fetchJson, toMs };
  ACS.AbortedError = AbortedError;
  ACS.sleep = sleep;
  ACS.platforms = ACS.platforms || {};
})();

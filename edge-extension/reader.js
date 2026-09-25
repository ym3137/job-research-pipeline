// Runs in the isolated extension world. Read rendered note content only.
export function readPage() {
  const visible = (e) => !!e && e.getClientRects().length > 0;
  const pick = (root, selectors) =>
    selectors.map((s) => root.querySelector(s)).find(visible);
  const note = pick(document, [
    '.note-detail-mask .note-container',
    '.note-container',
    '.note-detail',
  ]);
  const desc = note && pick(note, ['#detail-desc', '.desc', '.note-text']);
  if (desc?.innerText?.trim().length >= 15) {
    const comments = pick(note, [
      '.comments-container',
      '.comments-el',
      '.comment-list',
    ]);
    return {
      kind: 'note',
      url: location.href,
      title:
        pick(note, ['#detail-title', '.title'])?.innerText ||
        document.title.replace(/ - 小红书$/, ''),
      text:
        desc.innerText.slice(0, 11000) +
        (comments
          ? '\n\n可见评论（未经独立核实）：\n' +
            comments.innerText.slice(0, 4000)
          : ''),
      author:
        pick(note, ['.author .username', '.author .name', '.username'])
          ?.innerText || '',
      publishedAt:
        pick(note, ['.bottom-container .date', '.date'])?.innerText || '',
    };
  }
  const blocker = pick(document, [
    '.login-container',
    '.login-modal',
    '.captcha-container',
    '[class*="captcha"]',
    '[class*="verify-modal"]',
  ]);
  const text = document.body.innerText;
  if (
    blocker ||
    /安全验证|请完成验证|访问频繁|IP at risk|网络存在风险/.test(text) ||
    location.pathname.includes('/website-login/error')
  )
    return {
      kind: 'waiting_user',
      reason: '小红书要求登录或安全验证，请在专用标签页处理；处理后自动继续。',
    };
  const links = [
    ...document.querySelectorAll(
      'section.note-item a[href],.note-item a.cover[href]',
    ),
  ]
    .filter(visible)
    .map((a) => ({
      url: a.href,
      title:
        a.closest('.note-item')?.querySelector('.title')?.innerText ||
        a.innerText ||
        '',
    }))
    .filter((x) => {
      try {
        const u = new URL(x.url);
        return (
          u.origin === 'https://www.xiaohongshu.com' &&
          /^\/(explore|search_result)\/[a-f0-9]{24}$/.test(u.pathname)
        );
      } catch {
        return false;
      }
    });
  if (links.length)
    return {
      kind: 'search',
      links: [
        ...new Map(links.map((x) => [new URL(x.url).pathname, x])).values(),
      ].slice(0, 40),
    };
  if (/登录后查看|登录后搜索|扫码登录|手机号登录/.test(text))
    return {
      kind: 'waiting_user',
      reason: '请在小红书标签页登录，完成后自动继续。',
    };
  return {
    kind: 'unknown',
    reason:
      '页面尚未显示可识别的原帖或搜索结果；不将空白页面视为没有相关信息。',
  };
}

// Read only rendered Tesla/Moka recruiting content. Page text is returned as data;
// instructions found in the page are never executed by the extension.
export function readMokaPage() {
  const visible = (e) => !!e && e.getClientRects().length > 0;
  if (location.hostname !== 'app.mokahr.com')
    return { kind: 'blocked', reason: '当前标签页不是 Moka 官方招聘站。' };
  const text = (document.body?.innerText || '').replace(/\u00a0/g, ' ').trim();
  if (/安全验证|访问频繁|验证码|captcha/i.test(text))
    return {
      kind: 'waiting_user',
      reason:
        'Moka 要求完成安全验证，请在专用官网标签页处理；完成后会自动继续。',
    };
  if (/职位已下线|职位不存在|停止招聘|已停止招聘/.test(text))
    return {
      kind: 'closed',
      url: location.href,
      reason: '岗位详情显示已下线或停止招聘。',
    };
  if (location.hash.startsWith('#/jobs')) {
    const links = [...document.querySelectorAll('a[href*="#/job/"]')]
      .filter(visible)
      .map((a) => {
        const raw = (a.innerText || a.textContent || '')
          .replace(/\s+/g, ' ')
          .trim();
        const title = (
          raw.match(/^(?:急\s*)?(.+?)\s*发布于\s*\d{4}-\d{2}-\d{2}/)?.[1] ||
          raw.split(/\s{2,}/)[0] ||
          ''
        )
          .trim()
          .replace(/^[^0-9A-Za-z\u4e00-\u9fff]*急\s*/, '');
        const released = raw.match(/发布于\s*(\d{4}-\d{2}-\d{2})/)?.[1] || '';
        const location =
          raw.match(/\|\s*([^|]+?)(?:\s+\1)?$/)?.[1]?.trim() || '';
        return { title, url: a.href, location, released };
      })
      .filter(
        (x) =>
          x.title &&
          /^https:\/\/app\.mokahr\.com\/campus-recruitment\/[^/]+\/\d+.*#\/job\/[a-f0-9-]{36}(?:\?.*)?$/.test(
            x.url,
          ),
      );
    const unique = [...new Map(links.map((x) => [x.url, x])).values()];
    const total = Number(
      text.match(/(?:已选\s*\d+\s*条件\s*\|\s*)?(\d+)\s*结果/)?.[1],
    );
    if (/数据读取中/.test(text) || (total === 0 && unique.length))
      return { kind: 'loading', reason: '官网职位列表仍在加载。' };
    if (unique.length && Number.isInteger(total) && total >= unique.length) {
      const params = new URLSearchParams(location.hash.split('?')[1] || '');
      const page = Number(params.get('page') || 1);
      return {
        kind: 'official_list',
        url: location.href,
        total,
        page,
        totalPages: Math.max(1, Math.ceil(total / 30)),
        jobs: unique,
      };
    }
    if (/数据读取中/.test(text) || !/在招职位/.test(text))
      return { kind: 'loading', reason: '官网职位列表仍在加载。' };
    return {
      kind: 'unknown',
      reason:
        '官网职位列表已显示，但尚未识别到职位卡片；不会把空白占位当作零岗位。',
    };
  }
  if (/^#\/job\/[a-f0-9-]{36}(?:\?.*)?$/.test(location.hash)) {
    const start = text.indexOf('职位描述');
    const end = text.indexOf('关注我们', start + 4);
    if (start >= 0 && /申请职位/.test(text)) {
      const description = text
        .slice(start, end > start ? end : undefined)
        .trim();
      const title =
        text
          .match(
            /(?:^|\n)(?:急\s*)?([^\n]{2,120})(?:\n|\s)+(?:分享\s*)?(?:\n|\s)+[^\n|]+\s*\|/,
          )?.[1]
          ?.trim() || '';
      const meta = text.match(
        /([^\n|]+)\s*\|\s*([^\n]+?)\s*发布于\s*(\d{4}-\d{2}-\d{2})/,
      );
      if (description.length >= 80)
        return {
          kind: 'official_detail',
          url: location.href,
          title,
          location: meta?.[1]?.trim() || '',
          released: meta?.[3] || '',
          description: description.slice(0, 30000),
        };
    }
    return { kind: 'loading', reason: '官网岗位详情仍在加载。' };
  }
  return { kind: 'unknown', reason: '尚未进入 Moka 职位列表或详情页。' };
}

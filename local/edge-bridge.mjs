import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const XHS_TARGET_NOTES = 20;
const OFFICIAL_TARGET_DETAILS = 36;
const XHS_QUERIES = (company) => [
  `${company} 校招 面经`,
  `${company} 校招 薪资`,
  `${company} 工作体验 成长`,
  `${company} 管培生 面试`,
  `${company} 业务分析 面试`,
  `${company} 数据分析 面试`,
  `${company} 秋招 笔试`,
  `${company} 加班 工作强度`,
  `${company} 晋升 职业发展`,
  `${company} 实习 转正`,
  `${company} 员工 评价`,
];

export function canonicalNote(value) {
  const u = new URL(value);
  if (
    u.origin !== 'https://www.xiaohongshu.com' ||
    !/^\/(explore|search_result)\/[a-f0-9]{24}$/.test(u.pathname)
  )
    throw Error('不是有效的小红书原帖链接');
  return `https://www.xiaohongshu.com/explore/${u.pathname.split('/').pop()}`;
}
export function createEdgeBridge(
  dir,
  { timeoutMs = 10 * 60 * 1000, now = () => Date.now() } = {},
) {
  const file = path.join(dir, 'edge-connection.json');
  let connection;
  try {
    connection = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {}
  let seen = 0,
    current = null,
    last = null;
  const save = () => {
    fs.writeFileSync(file, JSON.stringify(connection), { mode: 0o600 });
  };
  function finish(status, reason) {
    if (!current) return;
    const j = current;
    current = null;
    clearTimeout(j.timer);
    const checkedAt = new Date(now()).toISOString();
    if (j.kind === 'official') {
      const jobs = [...j.jobs.values()];
      const verified =
        status === 'complete' &&
        j.totalPages > 0 &&
        j.pages.size >= j.totalPages;
      const officialStatus = verified
        ? jobs.length
          ? 'verified_nonempty'
          : 'verified_empty'
        : jobs.length
          ? 'verified_partial'
          : 'blocked';
      last = {
        id: j.id,
        kind: j.kind,
        status: officialStatus,
        reason,
        count: jobs.filter((x) => x.detailVerified).length,
        target: j.detailTarget,
        checkedAt,
      };
      j.resolve({
        status: officialStatus,
        source: j.url,
        method: 'official_edge_rendered',
        checkedAt,
        reason,
        total: j.total ?? jobs.length,
        pages: j.pages.size,
        totalPages: j.totalPages || null,
        detailTarget: j.detailTarget,
        detailsRead: jobs.filter((x) => x.detailVerified).length,
        jobs,
      });
      return;
    }
    last = {
      id: j.id,
      kind: j.kind,
      status,
      reason,
      count: j.notes.length,
      target: XHS_TARGET_NOTES,
      checkedAt,
    };
    j.resolve({
      source: '小红书',
      status,
      reason,
      checkedAt,
      url: 'https://www.xiaohongshu.com/explore',
      target: XHS_TARGET_NOTES,
      notes: j.notes,
    });
  }
  return {
    pair(extensionId) {
      if (!/^[a-p]{32}$/.test(extensionId)) throw Error('连接组件标识无效');
      if (connection?.extensionId !== extensionId)
        connection = {
          extensionId,
          token: crypto.randomBytes(32).toString('hex'),
        };
      save();
      return { token: connection.token };
    },
    authorized(req) {
      const origin = req.headers.origin;
      return (
        !!connection &&
        (!origin ||
          origin === `chrome-extension://${connection.extensionId}`) &&
        req.headers['x-edge-token'] === connection.token
      );
    },
    state() {
      return {
        installed: !!connection,
        connected: !!seen && now() - seen < 75000,
        lastSeen: seen ? new Date(seen).toISOString() : '',
        job: current
          ? {
              id: current.id,
              kind: current.kind,
              status: current.status,
              reason: current.reason,
              count:
                current.kind === 'official'
                  ? [...current.jobs.values()].filter((x) => x.detailVerified)
                      .length
                  : current.notes.length,
              target:
                current.kind === 'official'
                  ? current.detailTarget
                  : XHS_TARGET_NOTES,
            }
          : null,
        last,
      };
    },
    disconnect() {
      finish('partial', '浏览器连接已断开。');
      connection = null;
      seen = 0;
      fs.rmSync(file, { force: true });
    },
    collect(company, onProgress = () => {}) {
      if (current) throw Error('浏览器正在读取另一项研究，请稍候');
      if (!seen || now() - seen >= 75000)
        return Promise.resolve({
          source: '小红书',
          status: 'not_attempted',
          reason:
            'Edge 连接组件未在线。本轮未自动读取；请在 Edge 打开工作台完成连接。',
          url: 'https://www.xiaohongshu.com/explore',
          checkedAt: new Date(now()).toISOString(),
          target: XHS_TARGET_NOTES,
          notes: [],
        });
      return new Promise((resolve) => {
        current = {
          id: crypto.randomUUID(),
          kind: 'community',
          company,
          queries: XHS_QUERIES(company.split(/[·｜|]/)[0].trim()),
          status: 'queued',
          reason: '等待 Edge 接收任务',
          notes: [],
          resolve,
          onProgress,
        };
        current.timer = setTimeout(
          () =>
            finish(
              current?.notes.length ? 'partial' : 'blocked',
              `等待浏览器超过10分钟，已读取 ${current?.notes.length || 0}/${XHS_TARGET_NOTES} 篇原帖；未完成的来源仍待核实。`,
            ),
          timeoutMs,
        );
        onProgress(`正在通过 Edge 读取小红书（目标 ${XHS_TARGET_NOTES} 篇）…`);
      });
    },
    collectOfficial(company, url, onProgress = () => {}) {
      if (current) throw Error('浏览器正在读取另一项研究，请稍候');
      let u;
      try {
        u = new URL(url);
      } catch {
        throw Error('官网链接无效');
      }
      if (
        u.protocol !== 'https:' ||
        u.hostname !== 'app.mokahr.com' ||
        !/^\/campus-recruitment\/[^/]+\/\d+/.test(u.pathname)
      )
        return Promise.resolve({
          status: 'unverified',
          source: url,
          method: 'official_site_discovery',
          checkedAt: new Date(now()).toISOString(),
          reason: '当前浏览器动态读取器尚不支持此招聘站点。',
          total: null,
          pages: 0,
          jobs: [],
        });
      if (!seen || now() - seen >= 75000)
        return Promise.resolve({
          status: 'blocked',
          source: url,
          method: 'official_edge_rendered',
          checkedAt: new Date(now()).toISOString(),
          reason:
            'Edge 连接组件未在线，无法读取动态官网。请保持 Edge 与工作台开启。',
          total: null,
          pages: 0,
          jobs: [],
        });
      return new Promise((resolve) => {
        current = {
          id: crypto.randomUUID(),
          kind: 'official',
          company,
          url: u.href,
          status: 'queued',
          reason: '等待 Edge 打开动态官网',
          jobs: new Map(),
          pages: new Set(),
          total: null,
          totalPages: 0,
          detailTarget: OFFICIAL_TARGET_DETAILS,
          resolve,
          onProgress,
        };
        current.timer = setTimeout(
          () =>
            finish(
              current?.jobs?.size ? 'partial' : 'blocked',
              `等待浏览器超过10分钟；已读取 ${current?.pages?.size || 0}/${current?.totalPages || '?'} 页列表和 ${[...(current?.jobs?.values?.() || [])].filter((x) => x.detailVerified).length} 个岗位详情。`,
            ),
          timeoutMs,
        );
        onProgress('正在通过 Edge 读取动态官网职位列表…');
      });
    },
    poll() {
      seen = now();
      return {
        job: current
          ? current.kind === 'official'
            ? {
                id: current.id,
                kind: 'official',
                company: current.company,
                url: current.url,
                maxDetails: current.detailTarget,
              }
            : {
                id: current.id,
                kind: 'community',
                company: current.company,
                queries: current.queries,
                maxNotes: XHS_TARGET_NOTES,
              }
          : null,
      };
    },
    update(data) {
      seen = now();
      if (!current || data.id !== current.id)
        throw Error('浏览器任务已结束或过期');
      if (
        ![
          'reading',
          'waiting_user',
          'partial',
          'blocked',
          'complete',
          'unverified',
        ].includes(data.status)
      )
        throw Error('读取状态无效');
      const reason = String(data.reason || '').slice(0, 600);
      if (current.kind === 'official') {
        const base = new URL(current.url);
        const valid = (value) => {
          try {
            const u = new URL(value);
            return (
              u.origin === base.origin &&
              u.pathname.startsWith(base.pathname.replace(/\/$/, '')) &&
              /^#\/job\/[a-f0-9-]{36}(?:\?.*)?$/.test(u.hash)
            );
          } catch {
            return false;
          }
        };
        if (data.page) {
          const p = data.page;
          if (
            !Number.isInteger(p.page) ||
            p.page < 1 ||
            !Number.isInteger(p.total) ||
            p.total < 0 ||
            !Number.isInteger(p.totalPages) ||
            p.totalPages < 1 ||
            !Array.isArray(p.jobs) ||
            p.jobs.length > 50
          )
            throw Error('官网列表数据无效');
          current.total = p.total;
          current.totalPages = p.totalPages;
          current.pages.add(p.page);
          for (const item of p.jobs) {
            if (
              !valid(item.url) ||
              typeof item.title !== 'string' ||
              item.title.trim().length < 2 ||
              item.title.length > 300
            )
              throw Error('官网岗位卡片无效');
            if (!current.jobs.has(item.url))
              current.jobs.set(item.url, {
                id: new URL(item.url).hash.split('/').pop(),
                title: item.title.trim(),
                url: item.url,
                applicationUrl: item.url,
                location: String(item.location || '').slice(0, 200),
                released: String(item.released || '').slice(0, 100),
                description: '',
                detailVerified: false,
              });
          }
        }
        if (data.officialJob) {
          const item = data.officialJob;
          if (
            !valid(item.url) ||
            typeof item.description !== 'string' ||
            item.description.trim().length < 80 ||
            item.description.length > 30000
          )
            throw Error('官网岗位详情无效');
          const existing = current.jobs.get(item.url);
          if (!existing) throw Error('岗位详情不在本次官网列表中');
          current.jobs.set(item.url, {
            ...existing,
            title: String(item.title || existing.title)
              .trim()
              .slice(0, 300),
            location: String(item.location || existing.location).slice(0, 200),
            released: String(item.released || existing.released).slice(0, 100),
            description: item.description.trim(),
            detailVerified: true,
          });
        }
        current.status = data.status;
        current.reason = reason;
        current.onProgress(reason || '正在通过 Edge 读取动态官网…');
        if (
          ['complete', 'partial', 'blocked', 'unverified'].includes(data.status)
        )
          finish(data.status, reason || '动态官网读取结束。');
        return { ok: true };
      }
      if (data.note) {
        const n = data.note;
        const url = canonicalNote(n.url);
        if (
          typeof n.text !== 'string' ||
          n.text.trim().length < 15 ||
          n.text.length > 16000 ||
          typeof n.title !== 'string' ||
          n.title.length > 500
        )
          throw Error('原帖内容无效');
        if (
          !current.notes.some((x) => x.url === url) &&
          current.notes.length < XHS_TARGET_NOTES
        )
          current.notes.push({
            company: current.company,
            title: n.title,
            url,
            text: n.text,
            author: String(n.author || '').slice(0, 100),
            publishedAt: String(n.publishedAt || '').slice(0, 100),
            checkedAt: new Date(now()).toISOString(),
            sourceType: 'edge_extension',
            readVerified: true,
            independentlyVerified: false,
          });
      }
      current.status = data.status;
      current.reason = reason;
      current.onProgress(reason || '正在通过 Edge 读取小红书…');
      if (
        ['complete', 'partial', 'blocked', 'unverified'].includes(data.status)
      )
        finish(
          current.notes.length
            ? 'partial'
            : data.status === 'complete'
              ? 'unverified'
              : data.status,
          reason || '已完成有限范围的原帖读取，内容真实性仍需交叉验证。',
        );
      return { ok: true };
    },
    cancel() {
      finish('partial', '任务已停止，浏览器不会继续读取。');
    },
  };
}

export function attachEdgeEvidence(result, evidence) {
  const row = {
    source: '小红书',
    status: evidence.status,
    reason: evidence.reason,
    impact:
      '自动读取仅证明获得页面内容，不代表作者身份、薪资或工作体验已被独立证实。',
    url: evidence.url,
    checkedAt: evidence.checkedAt,
  };
  result.sourceAccess = [
    row,
    ...(result.sourceAccess || []).filter((r) => !r.source.includes('小红书')),
  ];
  if (!evidence.notes.length) result.communityVerification = 'unavailable';
  result.communitySources = [
    ...new Set([
      ...(result.communitySources || []).filter(
        (u) =>
          !u.includes('xiaohongshu.com') ||
          evidence.notes.some((n) => n.url === u),
      ),
      ...evidence.notes.map((n) => n.url),
    ]),
  ];
  result.report +=
    '\n\n## Edge 自动读取记录\n\n' +
    `本轮目标 ${evidence.target || XHS_TARGET_NOTES} 篇，实际读取 ${evidence.notes.length} 篇。` +
    evidence.reason +
    '\n\n' +
    evidence.notes
      .map(
        (n) =>
          `- [${n.title.replaceAll('[', ' ').replaceAll(']', ' ').replaceAll('\n', ' ')}](${n.url})（读取时间：${n.checkedAt}）`,
      )
      .join('\n') +
    '\n\n仅列出实际读取的原帖；广告识别、岗位对应关系和论坛交叉核验见正文。';
}

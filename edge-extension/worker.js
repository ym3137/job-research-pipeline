import { readPage, readMokaPage } from './reader.js';
const base = 'http://127.0.0.1:4318';
let busy = false;
async function api(route, data) {
  const { token } = await chrome.storage.local.get('token');
  if (!token) throw Error('尚未连接工作台');
  const r = await fetch(base + '/api/edge/' + route, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Edge-Token': token },
    body: JSON.stringify(data || {}),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw Error('工作台连接失效');
  return r.json();
}
const save = (state) => chrome.storage.local.set({ progress: state });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export async function step() {
  if (busy) return;
  busy = true;
  try {
    const { job } = await api('poll');
    let { progress: s } = await chrome.storage.local.get('progress');
    if (!job) {
      if (s) await chrome.storage.local.remove('progress');
      return;
    }
    if (s?.id !== job.id)
      s =
        job.kind === 'official'
          ? {
              id: job.id,
              kind: 'official',
              stage: 'list',
              page: 1,
              totalPages: 1,
              candidates: [],
              queue: [],
              seen: [],
              listCount: 0,
              count: 0,
              attempts: 0,
            }
          : {
              id: job.id,
              kind: 'community',
              q: 0,
              queue: [],
              seen: [],
              count: 0,
              stage: 'search',
              attempts: 0,
            };
    if (job.kind === 'official') return await stepOfficial(job, s);
    let tab;
    try {
      tab = await chrome.tabs.get(s.tabId);
    } catch {}
    if (!tab) {
      tab = await chrome.tabs.create({
        url: 'https://www.xiaohongshu.com/explore',
        active: false,
      });
      s.tabId = tab.id;
      s.loaded = false;
      await save(s);
    }
    if (!s.loaded) {
      const url =
        s.stage === 'search'
          ? `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(job.queries[s.q])}&source=web_search_result_notes`
          : s.queue[0].url;
      // URLs only come from known XHS search results; never follow arbitrary page instructions.
      const u = new URL(url);
      if (u.origin !== 'https://www.xiaohongshu.com') throw Error('无效来源');
      await chrome.tabs.update(s.tabId, { url });
      s.loaded = true;
      s.attempts = 0;
      await save(s);
      await wait(3500);
    }
    const results = await chrome.scripting.executeScript({
      target: { tabId: s.tabId },
      func: readPage,
    });
    const page = results[0]?.result;
    if (page?.kind === 'waiting_user') {
      await api('update', {
        id: s.id,
        status: 'waiting_user',
        reason: page.reason,
      });
      if (!s.notified) {
        await chrome.tabs.update(s.tabId, { active: true });
        s.notified = true;
        await save(s);
      }
      return;
    }
    s.notified = false;
    if (s.stage === 'search' && page?.kind === 'search') {
      s.queue = page.links
        .filter(
          (n) =>
            !s.seen.includes(new URL(n.url).pathname.split('/').pop()) &&
            !/内推码|付费|保过|代投|资料售|领取资料/.test(n.title),
        )
        .slice(0, 5);
      s.stage = s.queue.length ? 'note' : 'search';
      s.loaded = false;
      s.attempts = 0;
      if (!s.queue.length) s.q++;
    } else if (
      s.stage === 'note' &&
      page?.kind === 'note' &&
      new URL(page.url).pathname.split('/').pop() ===
        new URL(s.queue[0].url).pathname.split('/').pop()
    ) {
      await api('update', {
        id: s.id,
        status: 'reading',
        reason: `已读取 ${s.count + 1} 篇原帖，继续核对…`,
        note: { ...page, url: s.queue[0].url },
      });
      s.count++;
      s.seen.push(new URL(s.queue.shift().url).pathname.split('/').pop());
      s.loaded = false;
      s.attempts = 0;
      if (!s.queue.length) {
        s.stage = 'search';
        s.q++;
      }
    } else {
      s.attempts++;
      if (s.attempts < 3) {
        await save(s);
        return;
      }
      if (s.stage === 'note') {
        s.queue.shift();
        if (!s.queue.length) {
          s.stage = 'search';
          s.q++;
        }
      } else s.q++;
      s.loaded = false;
      s.attempts = 0;
    }
    if (s.q >= job.queries.length || s.count >= job.maxNotes) {
      const reached = s.count >= job.maxNotes;
      await api('update', {
        id: s.id,
        status: s.count ? 'complete' : 'unverified',
        reason: `已尝试 ${Math.min(s.q + 1, job.queries.length)} 组检索，去重后读取 ${s.count}/${job.maxNotes} 篇原帖；${reached ? '达到本轮阅读目标' : '未达到阅读目标：可见结果不足或部分页面未能读取'}。薪资及员工体验仍需交叉核验。`,
      });
      await chrome.storage.local.remove('progress');
      return;
    }
    await save(s);
    await api('update', {
      id: s.id,
      status: 'reading',
      reason: `正在读取小红书原帖（已读 ${s.count}/${job.maxNotes} 篇）…`,
    });
  } catch (e) {
    if (/No tab with id/i.test(String(e?.message))) {
      const { progress: s } = await chrome.storage.local.get('progress');
      if (s) {
        delete s.tabId;
        s.loaded = false;
        s.attempts = 0;
        await save(s);
      }
      return;
    }
    if (
      !/工作台连接失效|尚未连接工作台|fetch|abort|timeout/i.test(
        String(e?.message),
      )
    ) {
      const { progress: s } = await chrome.storage.local.get('progress');
      if (s)
        try {
          await api('update', {
            id: s.id,
            status: 'blocked',
            reason: '浏览器页面读取失败：' + String(e.message).slice(0, 220),
          });
          await chrome.storage.local.remove('progress');
        } catch {}
    }
  } finally {
    busy = false;
  }
}
function officialURL(entry, route) {
  const u = new URL(entry);
  u.search = '';
  u.hash = route;
  return u.href;
}
function candidateScore(j) {
  let score = 0;
  const t = j.title;
  for (const [re, n] of [
    [/2027届/, 35],
    [/上海/, 20],
    [/数据|分析|智能|AI|Agent|算法/, 45],
    [
      /商业|策略|运营|产品|项目|供应链|采购|计划|规划|财务|金融|市场|客户|数字化/,
      30,
    ],
    [/技师|维修|装配工|C\+\+|嵌入式/, -30],
  ])
    if (re.test(t)) score += n;
  return score;
}
async function stepOfficial(job, s) {
  let tab;
  try {
    tab = await chrome.tabs.get(s.tabId);
  } catch {}
  if (!tab) {
    tab = await chrome.tabs.create({ url: job.url, active: false });
    s.tabId = tab.id;
    s.loaded = false;
    await save(s);
  }
  if (!s.loaded) {
    const url =
      s.stage === 'list'
        ? officialURL(job.url, `/jobs?page=${s.page}&anchorName=jobsList`)
        : s.queue[0]?.url;
    if (!url) throw Error('官网读取队列为空');
    const u = new URL(url);
    if (u.origin !== 'https://app.mokahr.com') throw Error('无效官网来源');
    await chrome.tabs.update(s.tabId, { url });
    s.loaded = true;
    s.attempts = 0;
    await save(s);
    await wait(3200);
  }
  const results = await chrome.scripting.executeScript({
    target: { tabId: s.tabId },
    func: readMokaPage,
  });
  const page = results[0]?.result;
  if (page?.kind === 'waiting_user') {
    await api('update', {
      id: s.id,
      status: 'waiting_user',
      reason: page.reason,
    });
    if (!s.notified) {
      await chrome.tabs.update(s.tabId, { active: true });
      s.notified = true;
      await save(s);
    }
    return;
  }
  s.notified = false;
  if (
    s.stage === 'list' &&
    page?.kind === 'official_list' &&
    page.page === s.page
  ) {
    await api('update', {
      id: s.id,
      status: 'reading',
      reason: `官网列表已读取 ${s.page}/${page.totalPages} 页（共 ${page.total} 个岗位）…`,
      page,
    });
    s.totalPages = page.totalPages;
    s.listCount = Math.max(s.listCount, page.total);
    for (const j of page.jobs)
      if (!s.candidates.some((x) => x.url === j.url) && candidateScore(j) > 20)
        s.candidates.push({ ...j, score: candidateScore(j) });
    if (s.page < s.totalPages) {
      s.page++;
      s.loaded = false;
      s.attempts = 0;
    } else {
      s.queue = s.candidates
        .sort((a, b) => b.score - a.score)
        .slice(0, job.maxDetails);
      s.stage = 'detail';
      s.loaded = false;
      s.attempts = 0;
    }
  } else if (
    s.stage === 'detail' &&
    page?.kind === 'official_detail' &&
    new URL(page.url).hash === new URL(s.queue[0].url).hash
  ) {
    const expected = s.queue.shift();
    await api('update', {
      id: s.id,
      status: 'reading',
      reason: `已核对 ${s.count + 1}/${Math.min(job.maxDetails, s.candidates.length)} 个相关岗位详情…`,
      officialJob: {
        ...page,
        title: expected.title,
        location: page.location || expected.location,
        released: page.released || expected.released,
        url: expected.url,
      },
    });
    s.count++;
    s.loaded = false;
    s.attempts = 0;
  } else if (s.stage === 'detail' && page?.kind === 'closed') {
    s.queue.shift();
    s.loaded = false;
    s.attempts = 0;
  } else {
    s.attempts++;
    if (s.attempts < 4) {
      await save(s);
      return;
    }
    if (s.stage === 'detail') s.queue.shift();
    else if (s.page < s.totalPages) s.page++;
    else {
      s.queue = s.candidates
        .sort((a, b) => b.score - a.score)
        .slice(0, job.maxDetails);
      s.stage = 'detail';
    }
    s.loaded = false;
    s.attempts = 0;
  }
  if (
    (s.stage === 'detail' && !s.queue.length) ||
    (s.stage === 'list' && s.page > s.totalPages)
  ) {
    await api('update', {
      id: s.id,
      status: s.listCount ? 'complete' : 'unverified',
      reason: `已读取官网 ${s.totalPages} 页职位列表（共 ${s.listCount} 个岗位），并实际打开核对 ${s.count} 个与求职档案较相关的岗位详情。`,
    });
    await chrome.storage.local.remove('progress');
    return;
  }
  await save(s);
  await api('update', {
    id: s.id,
    status: 'reading',
    reason:
      s.stage === 'list'
        ? `正在读取官网职位列表第 ${s.page}/${s.totalPages} 页…`
        : `正在核对相关岗位详情（${s.count}/${Math.min(job.maxDetails, s.candidates.length)}）…`,
  });
}
chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (
    m.type === 'connect' &&
    sender.url?.startsWith(base + '/') &&
    typeof m.token === 'string'
  ) {
    chrome.storage.local.set({ token: m.token }).then(async () => {
      await chrome.alarms.create('career-edge', { periodInMinutes: 0.5 });
      await step();
      reply({ ok: true });
    });
    return true;
  }
});
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'career-edge') void step();
});
chrome.runtime.onStartup.addListener(async () => {
  await chrome.alarms.create('career-edge', { periodInMinutes: 0.5 });
  await step();
});
chrome.runtime.onInstalled.addListener(async () => {
  await chrome.alarms.create('career-edge', { periodInMinutes: 0.5 });
  await chrome.tabs.create({ url: base + '/' });
});
// Poll promptly while awake; alarms restore polling after service-worker suspension.
setInterval(step, 5000);

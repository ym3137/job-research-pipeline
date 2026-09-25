import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
export const SHEIN_LIST = 'https://careers.shein.cn/All-Jobs?jobTypeId=CAMPUS';
const API = 'https://careers.shein.cn/api/v1/open/grw/front/jobPage';
async function request(payload) {
  const { stdout } = await exec(
    '/usr/bin/curl',
    [
      '--silent',
      '--show-error',
      '--fail',
      '--max-time',
      '25',
      API,
      '-H',
      'Content-Type: application/json',
      '--data',
      JSON.stringify(payload),
    ],
    { maxBuffer: 4 * 1024 * 1024, timeout: 30000 },
  );
  return JSON.parse(stdout);
}
export function officialJobURL(job) {
  let u;
  try {
    u = new URL(job.jobDetailUrl);
  } catch {
    throw Error('官网未返回有效岗位详情链接');
  }
  if (
    u.protocol !== 'https:' ||
    u.username ||
    u.password ||
    !['app.mokahr.com', 'careers.shein.cn'].includes(u.hostname) ||
    !u.href.includes(job.jobId)
  )
    throw Error('官网岗位链接与岗位编号不匹配');
  return u.href;
}
export async function collectInventory(url, fetchPage = request) {
  if (new URL(url).hostname !== 'careers.shein.cn')
    return {
      status: 'unverified',
      source: url,
      method: 'official_site_discovery',
      checkedAt: new Date().toISOString(),
      reason:
        '需要沿官网招聘入口继续检索、打开岗位列表和详情；入口页的静态文本不能代表岗位清单。',
      jobs: [],
    };
  const jobs = [],
    ids = new Set();
  let total;
  try {
    for (let current = 1; current <= 100; current++) {
      const response = await fetchPage({
        current,
        size: 10,
        langCode: 'CN',
        jobTypeIds: ['CAMPUS'],
        jobCategoryIds: [],
        countryIds: [],
        cityIds: [],
        key: '',
        cityName: '',
      });
      const info = response?.info;
      if (
        String(response?.code) !== '0' ||
        !Number.isInteger(info?.total) ||
        info.total < 0 ||
        !Array.isArray(info.records)
      )
        throw Error('岗位接口返回异常，不能判定无岗位');
      if (total !== undefined && total !== info.total)
        throw Error('翻页期间总数变化，请重新读取');
      total = info.total;
      for (const j of info.records) {
        if (
          !j.jobId ||
          !j.jobTitle ||
          !j.description ||
          j.jobTypeId !== 'CAMPUS' ||
          ids.has(j.jobId)
        )
          throw Error('岗位缺少内容、类别错误或分页重复');
        ids.add(j.jobId);
        jobs.push({
          id: j.jobId,
          title: j.jobTitle,
          url: officialJobURL(j),
          applicationUrl: j.jobDetailUrl,
          location: j.cityInfos?.map((c) => c.cityName).join('、') || '',
          country: j.countryName,
          released: j.releaseDate,
          description: j.description
            .replace(/<[^>]*>/g, ' ')
            .replace(/&nbsp;/g, ' '),
        });
      }
      if (jobs.length === total)
        return {
          status: total ? 'verified_nonempty' : 'verified_empty',
          source: SHEIN_LIST,
          method: 'official_api',
          checkedAt: new Date().toISOString(),
          total,
          pages: current,
          jobs,
        };
      if (!info.records.length || jobs.length > total)
        throw Error('分页不完整');
    }
    throw Error('超过分页上限');
  } catch (e) {
    return {
      status: 'blocked',
      source: SHEIN_LIST,
      checkedAt: new Date().toISOString(),
      total: total ?? null,
      jobs,
      reason: e.message,
    };
  }
}
export function reviewResearch(result, inventory) {
  if (
    result.recommendedTarget !== result.applicationLimit * 2 ||
    (result.applicationLimit > 0 &&
      result.positions.length > result.recommendedTarget)
  )
    throw Error('投递上限与推荐数量不一致');
  if (result.applicationLimit === 0 && result.positions.length > 12)
    throw Error('投递规则未明时，候选岗位清单过长；请先筛选相关岗位');
  const urls = result.positions.map((p) => p.url);
  if (
    new Set(urls).size !== urls.length ||
    urls.some((u) => {
      try {
        return new URL(u).protocol !== 'https:';
      } catch {
        return true;
      }
    })
  )
    throw Error('岗位链接无效或重复');
  if (inventory.status === 'blocked')
    return { status: 'partial', message: '官网读取受阻，不能判定无岗位' };
  if (inventory.status === 'verified_nonempty') {
    for (const p of result.positions)
      if (
        !inventory.jobs.some(
          (j) =>
            j.title === p.title &&
            (j.url === p.url || j.applicationUrl === p.url) &&
            (inventory.method !== 'official_edge_rendered' || j.detailVerified),
        )
      )
        throw Error('推荐岗位未匹配本次已打开的官网岗位详情');
    if (
      /(?:官网|校园招聘|职位列表|在招岗位).{0,20}(?:显示\s*0|为\s*0|没有岗位|无岗位)/.test(
        result.summary,
      )
    )
      throw Error('结论与官网非空岗位清单矛盾');
  }
  if (inventory.status === 'unverified' && inventory.source) {
    const host = new URL(inventory.source).hostname;
    const entry = new URL(inventory.source);
    entry.hash = '';
    for (const p of result.positions) {
      const candidate = new URL(p.url);
      if (candidate.hostname !== host)
        throw Error('未核验的岗位详情必须来自所给官网；请打开官方职位链接核对');
      candidate.hash = '';
      if (
        candidate.href === entry.href ||
        (host === 'careers.mastercard.com' &&
          !/^\/us\/en\/job\/R-\d+\//.test(candidate.pathname))
      )
        throw Error('岗位链接必须是官网职位详情，不能使用招聘入口或列表页');
    }
  }
  if (
    !result.applicationLimit ||
    result.positions.length < result.recommendedTarget ||
    inventory.status === 'unverified'
  )
    return {
      status: 'partial',
      message: '部分完成，请查看证据范围与待核实事项',
    };
  const sources = result.communitySources || [];
  const hosts = sources.flatMap((s) => {
    try {
      return [new URL(s).hostname];
    } catch {
      return [];
    }
  });
  if (
    result.communityVerification !== 'verified' ||
    !hosts.some((h) => /(^|\.)(xiaohongshu\.com|xhslink\.com)$/.test(h)) ||
    !hosts.some((h) => /(^|\.)(nowcoder\.com|maimai\.cn)$/.test(h))
  )
    return {
      status: 'partial',
      message: '官网岗位筛选已完成；社区交叉验证尚未完成',
    };
  return { status: 'completed', message: '已核验官网岗位并保存研究结果' };
}

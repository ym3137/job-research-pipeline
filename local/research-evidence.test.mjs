import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dimensions, validateComparison } from './comparison.mjs';
import {
  collectInventory,
  reviewResearch,
  SHEIN_LIST,
  officialJobURL,
} from './research-evidence.mjs';
const job = (id) => ({
  jobId: id,
  jobTitle: id,
  description: 'JD',
  jobDetailUrl: `https://app.mokahr.com/campus-recruitment/shein/2932#/job/${id}`,
  jobTypeId: 'CAMPUS',
});
test('salary and growth omissions cannot silently pass', () => {
  const p = {
    comparison: Object.fromEntries(
      Object.keys(dimensions).map((k) => [
        k,
        { value: '未披露', basis: 'unknown', source: '' },
      ]),
    ),
  };
  assert.equal(validateComparison(p), true);
  delete p.comparison.salary;
  assert.equal(validateComparison(p), false);
  p.comparison.salary = { value: '20K', basis: 'official', source: '' };
  assert.equal(validateComparison(p), false);
});
test('complete pagination, deduplication, real empty and network failure stay distinct', async () => {
  let calls = 0;
  const full = await collectInventory(SHEIN_LIST, async (p) => {
    calls++;
    return {
      code: '0',
      info: {
        total: 11,
        records:
          p.current === 1
            ? Array.from({ length: 10 }, (_, i) => job(String(i)))
            : [job('10')],
      },
    };
  });
  assert.equal(calls, 2);
  assert.equal(full.jobs.length, 11);
  assert.equal(full.status, 'verified_nonempty');
  const duplicate = await collectInventory(SHEIN_LIST, async () => ({
    code: '0',
    info: { total: 2, records: [job('a')] },
  }));
  assert.equal(duplicate.status, 'blocked');
  const error = await collectInventory(SHEIN_LIST, async () => {
    throw Error('network timeout');
  });
  assert.equal(error.status, 'blocked');
  assert.equal(error.total, null);
  const shell = await collectInventory(SHEIN_LIST, async () => ({
    info: { total: 0 },
  }));
  assert.equal(shell.status, 'blocked');
  const empty = await collectInventory(SHEIN_LIST, async () => ({
    code: '0',
    info: { total: 0, records: [] },
  }));
  assert.equal(empty.status, 'verified_empty');
});
test('reject fabricated jobs and false empty claims; incomplete research is partial', () => {
  const r = {
    summary: '已读取官网岗位',
    applicationLimit: 3,
    recommendedTarget: 6,
    positions: [],
  };
  const inventory = {
    status: 'verified_nonempty',
    jobs: [{ title: 'A', url: 'https://example.com/A' }],
  };
  assert.equal(reviewResearch(r, inventory).status, 'partial');
  assert.throws(() =>
    reviewResearch({ ...r, summary: '官网显示0个岗位' }, inventory),
  );
  assert.throws(() =>
    reviewResearch(
      { ...r, positions: [{ title: 'B', url: 'https://example.com/B' }] },
      inventory,
    ),
  );
  assert.equal(
    reviewResearch(
      { ...r, positions: [{ title: 'A', url: 'https://example.com/A' }] },
      inventory,
    ).status,
    'partial',
  );
  const complete = {
    ...r,
    applicationLimit: 1,
    recommendedTarget: 2,
    communityVerification: 'verified',
    communitySources: [
      'https://www.xiaohongshu.com/explore/post',
      'https://www.nowcoder.com/discuss/post',
    ],
    positions: [
      { title: 'A', url: 'https://example.com/A' },
      { title: 'B', url: 'https://example.com/B' },
    ],
  };
  assert.equal(
    reviewResearch(complete, { ...inventory, jobs: complete.positions }).status,
    'completed',
  );
  assert.equal(
    reviewResearch(
      { ...complete, communitySources: [] },
      { ...inventory, jobs: complete.positions },
    ).status,
    'partial',
  );
  assert.equal(reviewResearch(r, { status: 'blocked' }).status, 'partial');
});

test('use official original detail URL without inventing a route', () => {
  assert.equal(
    officialJobURL(job('abc')),
    'https://app.mokahr.com/campus-recruitment/shein/2932#/job/abc',
  );
  assert.throws(() =>
    officialJobURL({ ...job('abc'), jobDetailUrl: 'https://evil.example/abc' }),
  );
  assert.throws(() => officialJobURL({ ...job('abc'), jobDetailUrl: '' }));
});

test('unknown application limit does not hide verified official job candidates', async () => {
  const url = 'https://careers.mastercard.com/us/en/early-careers/launch';
  const inventory = await collectInventory(url);
  assert.equal(inventory.status, 'unverified');
  assert.equal(inventory.source, url);
  const result = {
    summary: '官网可见上海岗位；申请次数待核实',
    applicationLimit: 0,
    recommendedTarget: 0,
    positions: [
      {
        title:
          'Associate Consultant, Launch Graduate Program 2027 - Shanghai, China',
        url: 'https://careers.mastercard.com/us/en/job/R-287567/example',
      },
    ],
  };
  assert.equal(reviewResearch(result, inventory).status, 'partial');
  assert.throws(() =>
    reviewResearch(
      { ...result, positions: [{ ...result.positions[0], url }] },
      inventory,
    ),
  );
  assert.throws(() =>
    reviewResearch(
      {
        ...result,
        positions: [
          { ...result.positions[0], url: 'https://other.example/job/R-287567' },
        ],
      },
      inventory,
    ),
  );
  assert.throws(() =>
    reviewResearch(
      {
        ...result,
        positions: Array(13)
          .fill(result.positions[0])
          .map((p, i) => ({ ...p, url: p.url + i })),
      },
      inventory,
    ),
  );
});
test('rendered Moka inventory accepts only jobs whose detail page was opened', () => {
  const base = {
    summary: '官网有岗位',
    applicationLimit: 1,
    recommendedTarget: 2,
    communityVerification: 'verified',
    communitySources: [
      'https://www.xiaohongshu.com/explore/post',
      'https://www.nowcoder.com/discuss/post',
    ],
  };
  const jobs = [
    {
      title: '已核对岗位',
      url: 'https://app.mokahr.com/campus-recruitment/tesla/41460#/job/11111111-1111-1111-1111-111111111111',
      detailVerified: true,
    },
    {
      title: '只见列表',
      url: 'https://app.mokahr.com/campus-recruitment/tesla/41460#/job/22222222-2222-2222-2222-222222222222',
      detailVerified: false,
    },
  ];
  const inventory = {
    status: 'verified_nonempty',
    method: 'official_edge_rendered',
    jobs,
  };
  assert.equal(
    reviewResearch(
      {
        ...base,
        positions: [
          jobs[0],
          {
            ...jobs[0],
            title: '已核对岗位2',
            url: 'https://app.mokahr.com/campus-recruitment/tesla/41460#/job/33333333-3333-3333-3333-333333333333',
          },
        ],
      },
      {
        ...inventory,
        jobs: [
          jobs[0],
          {
            ...jobs[0],
            title: '已核对岗位2',
            url: 'https://app.mokahr.com/campus-recruitment/tesla/41460#/job/33333333-3333-3333-3333-333333333333',
          },
        ],
      },
    ).status,
    'completed',
  );
  assert.throws(
    () => reviewResearch({ ...base, positions: [jobs[1]] }, inventory),
    /已打开/,
  );
});

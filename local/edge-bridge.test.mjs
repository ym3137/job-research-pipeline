import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createEdgeBridge,
  canonicalNote,
  attachEdgeEvidence,
} from './edge-bridge.mjs';
test('Edge pairing is scoped, source URLs are canonical, waiting resumes and stale submissions fail', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-bridge-'));
  try {
    const b = createEdgeBridge(dir),
      id = 'a'.repeat(32),
      { token } = b.pair(id);
    assert.equal(
      b.authorized({
        headers: { origin: 'https://evil.example', 'x-edge-token': token },
      }),
      false,
    );
    assert.equal(
      b.authorized({
        headers: { origin: `chrome-extension://${id}`, 'x-edge-token': token },
      }),
      true,
    );
    assert.equal((await b.collect('SHEIN')).status, 'not_attempted');
    b.poll();
    let messages = [];
    const result = b.collect('SHEIN', (s) => messages.push(s));
    const job = b.poll().job;
    assert.equal(job.maxNotes, 20);
    assert.ok(job.queries.length >= 10);
    assert.throws(() => b.collect('Other'), /另一项/);
    b.update({ id: job.id, status: 'waiting_user', reason: '请登录' });
    assert.equal(b.state().job.status, 'waiting_user');
    assert.throws(() =>
      b.update({
        id: job.id,
        status: 'reading',
        note: {
          url: 'https://evil.example/',
          title: 'bad',
          text: 'a'.repeat(20),
        },
      }),
    );
    const note = {
      url: 'https://www.xiaohongshu.com/explore/6aa0f531000000001103737f?xsec_token=secret',
      title: '笔试经历',
      text: '仅为个人经历，不能推广为统一题型。',
    };
    b.update({ id: job.id, status: 'reading', note });
    b.update({ id: job.id, status: 'reading', note });
    b.update({ id: job.id, status: 'complete', reason: '读取完成' });
    const e = await result;
    assert.equal(e.notes.length, 1);
    assert.ok(!e.notes[0].url.includes('secret'));
    assert.equal(e.status, 'partial');
    assert.equal(e.notes[0].independentlyVerified, false);
    assert.throws(() => b.update({ id: job.id, status: 'complete' }), /过期/);
    const r = {
      report: 'report',
      communityVerification: 'verified',
      sourceAccess: [],
    };
    attachEdgeEvidence(r, e);
    assert.equal(r.sourceAccess[0].status, 'partial');
    assert.ok(r.report.includes(note.title));
    b.disconnect();
    assert.equal(b.authorized({ headers: { 'x-edge-token': token } }), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test('Edge keeps up to twenty distinct opened notes and reports the target', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-twenty-'));
  try {
    const b = createEdgeBridge(dir);
    b.poll();
    const result = b.collect('SHEIN');
    const job = b.poll().job;
    for (let i = 0; i < 21; i++)
      b.update({
        id: job.id,
        status: 'reading',
        note: {
          url: `https://www.xiaohongshu.com/explore/${i.toString(16).padStart(24, '0')}`,
          title: `原帖 ${i}`,
          text: '来自实际打开的帖子，等待岗位对应关系核验。',
        },
      });
    b.update({ id: job.id, status: 'complete', reason: '达到目标' });
    const evidence = await result;
    assert.equal(evidence.target, 20);
    assert.equal(evidence.notes.length, 20);
    assert.equal(b.state().last.count, 20);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test('timeout, cancel and offline are explicit instead of false successful verification', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-timeout-'));
  try {
    const b = createEdgeBridge(dir, { timeoutMs: 20 });
    b.poll();
    assert.equal((await b.collect('SHEIN')).status, 'blocked');
    const p = b.collect('SHEIN');
    b.cancel();
    assert.match((await p).reason, /停止/);
    const r = { report: '', communityVerification: 'verified' };
    attachEdgeEvidence(r, {
      status: 'not_attempted',
      reason: 'offline',
      notes: [],
    });
    assert.equal(r.communityVerification, 'unavailable');
    assert.throws(() =>
      canonicalNote(
        'https://www.xiaohongshu.com@evil.example/explore/6aa0f531000000001103737f',
      ),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test('Edge verifies a paginated Moka inventory and keeps only opened details eligible', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-moka-'));
  try {
    const b = createEdgeBridge(dir);
    b.poll();
    const url = 'https://app.mokahr.com/campus-recruitment/tesla/41460#/';
    const pending = b.collectOfficial('Tesla', url);
    const job = b.poll().job;
    assert.equal(job.kind, 'official');
    const detail =
      'https://app.mokahr.com/campus-recruitment/tesla/41460#/job/33a81134-3926-49f7-8224-912be0f3352a';
    b.update({
      id: job.id,
      status: 'reading',
      reason: '第1页',
      page: {
        page: 1,
        total: 1,
        totalPages: 1,
        jobs: [
          {
            title: '2027届-质量中心数据工程师-上海',
            url: detail,
            location: '上海市',
            released: '2026-09-16',
          },
        ],
      },
    });
    b.update({
      id: job.id,
      status: 'reading',
      reason: '详情',
      officialJob: {
        title: '2027届-质量中心数据工程师-上海',
        url: detail,
        location: '上海市',
        released: '2026-09-16',
        description:
          '职位描述：负责质量数据分析、数据治理、AI Agent 与业务协同，使用 SQL 和 Python 推动降本增效。'.repeat(
            2,
          ),
      },
    });
    b.update({ id: job.id, status: 'complete', reason: '完成' });
    const inventory = await pending;
    assert.equal(inventory.status, 'verified_nonempty');
    assert.equal(inventory.method, 'official_edge_rendered');
    assert.equal(inventory.jobs[0].detailVerified, true);
    assert.match(inventory.jobs[0].description, /SQL/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

'use client';
import { SourceStatus, type SourceAccess } from './source-status';
import { CommunityPanel } from './community-panel';
import { EdgeConnection, type EdgeState } from './edge-connection';
import { JobComparison, type Job } from './job-comparison';
import { useEffect, useState } from 'react';
import { registerCareerTools } from '@/local/webmcp';
import {
  ArrowUpRight,
  ArrowRight,
  Compass,
  FileText,
  Search,
  CircleCheck,
  LoaderCircle,
  Download,
  Square,
  FolderOpen,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type Position = Job;
type Run = {
  id: string;
  company: string;
  url: string;
  kind: string;
  created: string;
  status: string;
  message: string;
  applicationRule?: string;
  recommendedTarget: number;
  resumeFile?: string;
  resumeFiles?: { markdown: string; docx: string; pdf: string };
  result?: {
    sourceAccess?: SourceAccess[];
    communityVerification?: string;
    applicationLimit?: number;
    summary: string;
    positions: Position[];
    report: string;
  };
  invalidated?: string;
  inventory?: {
    status: string;
    total?: number;
    jobs: unknown[];
    pages?: number;
    reason?: string;
  };
  error?: string;
  usage?: Record<string, number>;
  progress?: { stage: number; total: number };
};
type QuotaWindow = {
  remainingPercent: number;
  windowDurationMins: number | null;
  resetsAt: number | null;
};
type Quota = {
  status: 'available' | 'unavailable';
  planType?: string | null;
  primary?: QuotaWindow | null;
  secondary?: QuotaWindow | null;
  fetchedAt?: string;
};
type State = {
  edge?: EdgeState;
  authenticated: boolean;
  profile: string;
  resume: string;
  runs: Run[];
  token: string;
  quota?: Quota;
  communityAccess?: { status: string; checkedAt: string };
  communityEvidence?: unknown[];
};
const labels: Record<string, string> = {
  partial: '部分完成',
  invalidated: '已撤回',
  running: '正在处理',
  completed: '已完成',
  failed: '需要处理',
  cancelled: '已停止',
  interrupted: '运行中断',
};
function resetLabel(value: number | null | undefined) {
  return value
    ? new Date(value * 1000).toLocaleString('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '待更新';
}
function TaskProgress({
  run,
}: {
  run?: Pick<Run, 'kind' | 'progress' | 'status'>;
}) {
  const research = run?.kind !== 'resume';
  const steps = research
    ? ['官网岗位读取', '社区来源检查', '岗位分析与比较', '报告核验']
    : ['读取岗位与个人资料', '简历内容定制', '生成 Word / PDF', '文件检查'];
  const stage = Math.max(1, Math.min(4, run?.progress?.stage || 1));
  const value =
    run?.status === 'completed' || run?.status === 'partial'
      ? 100
      : [0, 15, 40, 70, 90][stage];
  return (
    <div className="task-progress" aria-live="polite">
      <div className="progress-heading">
        <strong>{research ? '研究报告进度' : '简历生成进度'}</strong>
        <span>{run ? `第 ${stage} / 4 阶段` : '正在开始'}</span>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-label={research ? '研究报告阶段进度' : '简历生成阶段进度'}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span style={{ width: `${value}%` }} />
      </div>
      <ol className="progress-steps">
        {steps.map((step, index) => (
          <li
            key={step}
            className={
              index + 1 < stage ? 'done' : index + 1 === stage ? 'active' : ''
            }
          >
            {step}
          </li>
        ))}
      </ol>
      <small>按已完成阶段显示；资料检索和 AI 分析耗时可能不同。</small>
    </div>
  );
}
function safeLink(value: string) {
  try {
    const u = new URL(value);
    return ['http:', 'https:'].includes(u.protocol) ? u.href : undefined;
  } catch {
    return undefined;
  }
}
function renderMarkdownLinks(value: string) {
  return value
    .split(/(\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g)
    .map((part, index) => {
      const match = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
      const href = match && safeLink(match[2]);
      return href ? (
        <a key={index} href={href} target="_blank" rel="noreferrer">
          {match[1]}
        </a>
      ) : (
        part
      );
    });
}
export default function Home() {
  const [state, setState] = useState<State | null>(null),
    [error, setError] = useState(''),
    [tab, setTab] = useState('workspace'),
    [selected, setSelected] = useState('');
  const [company, setCompany] = useState(''),
    [url, setUrl] = useState(''),
    [notes, setNotes] = useState(''),
    [model, setModel] = useState('gpt-6-astra'),
    [effort, setEffort] = useState('low'),
    [profile, setProfile] = useState(''),
    [resume, setResume] = useState(''),
    [busy, setBusy] = useState(false),
    [startingKind, setStartingKind] = useState('research'),
    [saved, setSaved] = useState('');
  async function refresh(initial = false) {
    try {
      const r = await fetch('/api/state');
      if (!r.ok)
        throw Error('本机服务暂时不可用，请重新打开「启动求职工作台」。');
      const d = (await r.json()) as State;
      setState(d);
      if (initial) {
        setProfile(d.profile);
        setResume(d.resume);
      }
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(
    () =>
      registerCareerTools((i) => {
        setCompany(i.company);
        setUrl(i.url);
        setTab('workspace');
      }),
    [],
  );
  useEffect(() => {
    refresh(true);
    const t = setInterval(() => refresh(), 3000);
    return () => clearInterval(t);
  }, []);
  async function send(path: string, body: unknown) {
    const r = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Career-Token': state?.token || '',
      },
      body: JSON.stringify(body),
    });
    const d = (await r.json()) as { id: string; error?: string };
    if (!r.ok) throw Error(d.error || '操作失败');
    return d;
  }
  async function start(kind = 'research', position?: Position) {
    setStartingKind(kind);
    setBusy(true);
    setError('');
    try {
      const r = await send('/api/runs', {
        kind,
        company,
        url,
        notes,
        model,
        effort,
        parentId: current?.id,
        position,
      });
      setSelected(r.id);
      setTab('workspace');
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const runs = state?.runs || [],
    current = runs.find((r) => r.id === selected) || runs[0],
    running = runs.some((r) => r.status === 'running'),
    ruleSummary = (current?.applicationRule || '')
      .split('官方证据：')[0]
      .trim(),
    hasRecommendedTarget = (current?.recommendedTarget ?? 0) > 0;
  function download(r: Run) {
    const blob = new Blob([r.result?.report || ''], {
      type: 'text/markdown;charset=utf-8',
    });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = `${r.company}-${r.kind === 'resume' ? '简历说明' : '岗位研究'}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }
  async function downloadResume(r: Run, format: 'docx' | 'pdf') {
    try {
      const response = await fetch(`/api/runs/${r.id}/files/${format}`, {
        method: 'POST',
        headers: { 'X-Career-Token': state?.token || '' },
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw Error(data.error || '文件下载失败');
      }
      const href = URL.createObjectURL(await response.blob());
      const a = document.createElement('a');
      a.href = href;
      a.download = `${r.company}-投递简历.${format}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="shell">
      <header className="masthead">
        <a className="brand" href="/">
          <span className="brandmark">
            <Compass size={24} />
          </span>
          <span>
            求职工作台<small>CAREER DESK</small>
          </span>
        </a>
        <div className="header-status">
          <span className="connection">
            <i className={state?.authenticated ? 'online' : ''} />
            {state?.authenticated ? 'Plus 已连接' : '正在检查连接'}
          </span>
          {state?.quota?.status === 'available' && (
            <span
              className="quota-chip"
              title="Codex 账户额度剩余比例，不是剩余 token 数"
            >
              5 小时剩余 {state.quota.primary?.remainingPercent ?? '—'}% ·
              本周剩余 {state.quota.secondary?.remainingPercent ?? '—'}%
            </span>
          )}
        </div>
      </header>
      <main>
        <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
          <div className="topline">
            <TabsList variant="line" className="navigation">
              <TabsTrigger value="workspace">工作台</TabsTrigger>
              <TabsTrigger value="resumes">
                简历库{' '}
                <span className="counter">
                  {
                    runs.filter(
                      (r) => r.kind === 'resume' && r.status === 'completed',
                    ).length
                  }
                </span>
              </TabsTrigger>
              <TabsTrigger value="profile">我的资料</TabsTrigger>
            </TabsList>
            <span className="local-note">仅存于这台电脑</span>
          </div>
          {error && (
            <div className="alert" role="alert">
              {error}
            </div>
          )}
          <TabsContent value="workspace">
            <section className="heading">
              <div>
                <p className="eyebrow">CAREER INTELLIGENCE / 2027</p>
                <h1>选对下一站。</h1>
                <p>用薪资、成长与生活的真实取舍，决定你的下一份工作。</p>
              </div>
              <div className="season">
                <span>你的决策准则</span>
                <b>成长性优先</b>
                <small>专业复利 · 国际机会 · 生活平衡</small>
              </div>
            </section>
            <div className="workspace-grid">
              <section className="panel input-panel">
                <div className="section-title">
                  <h2>新建岗位研究</h2>
                  <Search size={19} />
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    start();
                  }}
                >
                  <label>
                    公司名称
                    <Input
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      placeholder="例如：腾讯"
                      required
                      maxLength={100}
                    />
                  </label>
                  <label>
                    官方招聘链接
                    <Input
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://careers.example.com"
                      type="url"
                      required
                    />
                  </label>
                  <div className="rule-card">
                    <strong>自动核实投递规则</strong>
                    <span>
                      读取官网岗位及官方公告中的可投岗位数；推荐数量 =
                      可投岗位数 × 2。
                    </span>
                  </div>
                  <label>
                    本次偏好 <span className="optional">选填</span>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="例如：优先上海，关注商业分析与成长空间。"
                      maxLength={4000}
                    />
                  </label>
                  <details className="settings">
                    <summary>
                      运行设置 · {model.split('-').pop()} / {effort}
                    </summary>
                    <div className="settings-row">
                      <label>
                        模型
                        <Select
                          value={model}
                          onValueChange={(v) => v && setModel(v)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="gpt-6-astra">GPT-6 Astra</SelectItem>
                            <SelectItem value="gpt-5.6-terra">Terra</SelectItem>
                            <SelectItem value="gpt-5.6-sol">Sol</SelectItem>
                            <SelectItem value="gpt-5.6-luna">Luna</SelectItem>
                          </SelectContent>
                        </Select>
                      </label>
                      <label>
                        推理强度
                        <Select
                          value={effort}
                          onValueChange={(v) => v && setEffort(v)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="low">Light / Low（轻量）</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                          </SelectContent>
                        </Select>
                      </label>
                    </div>
                  </details>
                  <Button
                    className="primary-button"
                    type="submit"
                    disabled={busy || running || !state?.authenticated}
                  >
                    {busy || running ? (
                      <LoaderCircle className="spin" />
                    ) : (
                      <ArrowRight />
                    )}
                    {running ? '当前任务执行中' : '核实规则并筛选'}
                  </Button>
                  {busy && !running && (
                    <TaskProgress
                      run={{ kind: startingKind, status: 'running' }}
                    />
                  )}
                  <div className="quota-detail">
                    <strong>Codex 额度</strong>
                    {state?.quota?.status === 'available' ? (
                      <>
                        <span>
                          5 小时剩余{' '}
                          {state.quota.primary?.remainingPercent ?? '—'}%，
                          {resetLabel(state.quota.primary?.resetsAt)} 重置
                        </span>
                        <span>
                          本周剩余{' '}
                          {state.quota.secondary?.remainingPercent ?? '—'}%，
                          {resetLabel(state.quota.secondary?.resetsAt)} 重置
                        </span>
                      </>
                    ) : (
                      <span>
                        暂时无法读取账户额度。可在 Codex 的用量页面查看。
                      </span>
                    )}
                    <small>
                      额度约每分钟更新。Plus 按动态用量限制，不提供固定“剩余
                      token 数”；下方显示每次任务实际用量。
                    </small>
                  </div>
                  <p className="fineprint">
                    若官网无法核实志愿规则，系统只会报告原因，不会擅自假定数量。
                  </p>
                </form>
                <EdgeConnection
                  edge={state?.edge}
                  token={state?.token || ''}
                  company={
                    company.trim() || current?.company.split(' · ')[0] || ''
                  }
                  url={url.trim() || current?.url || ''}
                />
                <CommunityPanel
                  company={
                    company.trim() || current?.company.split(' · ')[0] || ''
                  }
                  token={state?.token || ''}
                  access={state?.communityAccess}
                />
              </section>
              <section className="results">
                <div className="result-heading">
                  <h2>研究与推荐</h2>
                  <span>{runs.length} 次任务</span>
                </div>
                {runs.length > 0 && (
                  <div className="run-picker">
                    {runs.map((r) => (
                      <button
                        key={r.id}
                        className={current?.id === r.id ? 'active' : ''}
                        onClick={() => setSelected(r.id)}
                      >
                        {r.company}
                        {r.kind === 'resume' ? ' · 简历' : ''}
                        <small>{labels[r.status]}</small>
                      </button>
                    ))}
                  </div>
                )}
                {!current ? (
                  <div className="empty-state">
                    <div className="empty-icon">
                      <Compass size={38} />
                    </div>
                    <h3>先选一家公司</h3>
                    <p>
                      添加官方招聘链接，开始第一轮研究。
                      <br />
                      岗位推荐和来源证据会保存在这里。
                    </p>
                    <div className="workflow">
                      <span>
                        <b>01</b>核实志愿规则
                      </span>
                      <ArrowRight />
                      <span>
                        <b>02</b>官网与社区筛选
                      </span>
                      <ArrowRight />
                      <span>
                        <b>03</b>简历定制
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="run-result">
                    <div className="run-meta">
                      <span className={`status ${current.status}`}>
                        {current.status === 'running' ? (
                          <LoaderCircle className="spin" size={16} />
                        ) : (
                          <CircleCheck size={16} />
                        )}{' '}
                        {labels[current.status]}
                      </span>
                      <time>
                        {new Date(current.created).toLocaleString('zh-CN')}
                      </time>
                    </div>
                    <h3>
                      {current.company}
                      {current.kind === 'resume' ? ' · 投递简历' : ''}
                    </h3>
                    {current.applicationRule && (
                      <div className="rule-result">
                        <div className="rule-stat">
                          <strong>
                            {current.result?.applicationLimit || '—'}
                          </strong>
                          <span>次投递机会</span>
                          <b>→</b>
                          <strong>{current.recommendedTarget || '—'}</strong>
                          <span>个推荐目标</span>
                        </div>
                        {current.recommendedTarget > 0 && (
                          <span className="rule-note">
                            先比较，再决定最终志愿
                          </span>
                        )}
                        <details>
                          <summary>查看官方核验依据</summary>
                          <p>{renderMarkdownLinks(current.applicationRule)}</p>
                        </details>
                      </div>
                    )}
                    {current.status === 'running' && (
                      <div className="activity">
                        <TaskProgress run={current} />
                        <p aria-live="polite">
                          {current.message || '正在连接 Codex…'}
                        </p>
                        <Button
                          variant="outline"
                          onClick={async () => {
                            try {
                              await send(`/api/runs/${current.id}/cancel`, {});
                              await refresh();
                            } catch (e) {
                              setError((e as Error).message);
                            }
                          }}
                        >
                          <Square size={14} />
                          停止任务
                        </Button>
                      </div>
                    )}
                    {current.usage && (
                      <p className="task-usage">
                        本次任务 Token：输入{' '}
                        {Number(current.usage.input_tokens || 0).toLocaleString(
                          'zh-CN',
                        )}{' '}
                        · 输出{' '}
                        {Number(
                          current.usage.output_tokens || 0,
                        ).toLocaleString('zh-CN')}
                      </p>
                    )}
                    {current.error && <p className="alert">{current.error}</p>}
                    {current.inventory && (
                      <p className="evidence">
                        官网读取：
                        {current.inventory.status === 'verified_nonempty' ||
                        current.inventory.status === 'verified_empty'
                          ? `已读取 ${current.inventory.jobs.length} / ${current.inventory.total} 个岗位，共 ${current.inventory.pages} 页`
                          : `未完成核验 · ${current.inventory.reason || '覆盖范围待确认'}`}
                        ；{current.recommendedTarget ? '推荐' : '官网候选'}{' '}
                        {current.result?.positions.length || 0}
                        {current.recommendedTarget
                          ? ` / ${current.recommendedTarget} 个`
                          : ' 个 · 投递次数待核实'}
                      </p>
                    )}
                    {current.invalidated && (
                      <p className="alert">
                        此报告已撤回：{current.invalidated}
                      </p>
                    )}
                    {current.result && !current.invalidated && (
                      <>
                        <SourceStatus
                          sources={current.result.sourceAccess}
                          verified={current.result.communityVerification}
                        />
                        <p className="summary-text">{current.result.summary}</p>
                        <JobComparison
                          jobs={current.result.positions}
                          tentative={!current.recommendedTarget}
                          busy={running || busy}
                          onResume={(p) => start('resume', p)}
                        />
                        <details
                          className="report"
                          open={current.kind === 'resume'}
                        >
                          <summary>
                            {current.kind === 'resume'
                              ? '查看简历内容与定制说明'
                              : '查看完整研究与来源'}
                          </summary>
                          <pre>
                            {renderMarkdownLinks(current.result.report)}
                          </pre>
                        </details>
                        {current.kind === 'resume' && current.resumeFiles ? (
                          <div className="document-downloads">
                            <Button
                              onClick={() => downloadResume(current, 'docx')}
                            >
                              <Download size={16} />
                              下载 Word
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => downloadResume(current, 'pdf')}
                            >
                              <Download size={16} />
                              下载 PDF
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() => download(current)}
                            >
                              下载定制说明
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="outline"
                            onClick={() => download(current)}
                          >
                            <Download size={16} />
                            下载研究报告
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </section>
            </div>
          </TabsContent>
          <TabsContent value="resumes">
            <section className="heading">
              <div>
                <p className="eyebrow">有依据地表达你的经历</p>
                <h1>一份岗位，一份简历。</h1>
                <p>
                  每份投递简历都会生成一页 Word 和 PDF，并保存到 Job
                  文件夹下以公司和岗位命名的独立子文件夹。
                </p>
              </div>
            </section>
            <div className="resume-grid">
              {runs
                .filter((r) => r.kind === 'resume' && r.result)
                .map((r) => (
                  <article className="panel resume-card" key={r.id}>
                    <FileText size={28} />
                    <h2>{r.company}</h2>
                    <p>{r.result?.summary}</p>
                    {r.resumeFiles && (
                      <small className="sync-note">
                        已保存至 Job /{' '}
                        {r.resumeFiles.docx.split('/').slice(0, -1).join('/')}
                      </small>
                    )}
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSelected(r.id);
                        setTab('workspace');
                      }}
                    >
                      查看内容
                    </Button>
                    {r.resumeFiles && (
                      <>
                        <Button onClick={() => downloadResume(r, 'docx')}>
                          <Download />
                          Word
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => downloadResume(r, 'pdf')}
                        >
                          <Download />
                          PDF
                        </Button>
                      </>
                    )}
                  </article>
                ))}
            </div>
            {!runs.some((r) => r.kind === 'resume' && r.result) && (
              <div className="empty-state">
                <FolderOpen size={36} />
                <h3>还没有定制简历</h3>
                <p>完成岗位研究后，在推荐岗位上选择「定制此岗位简历」。</p>
                <Button variant="outline" onClick={() => setTab('workspace')}>
                  回到工作台
                </Button>
              </div>
            )}
          </TabsContent>
          <TabsContent value="profile">
            <section className="heading">
              <div>
                <p className="eyebrow">你的长期求职背景</p>
                <h1>让每次推荐都了解你。</h1>
                <p>已导入现有求职档案。修改只影响此工作台，原文件保留。</p>
              </div>
            </section>
            <form
              className="profile-grid"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  await send('/api/profile', { profile, resume });
                  setSaved('已保存，下次任务使用更新后的资料。');
                  await refresh();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label className="panel">
                求职档案与筛选规则
                <Textarea
                  value={profile}
                  onChange={(e) => setProfile(e.target.value)}
                  rows={24}
                />
              </label>
              <label className="panel">
                主简历文字
                <Textarea
                  value={resume}
                  onChange={(e) => setResume(e.target.value)}
                  rows={24}
                  placeholder="粘贴完整、真实的简历经历，或补充现有档案没有覆盖的信息。"
                />
              </label>
              <div>
                <Button type="submit" disabled={busy}>
                  保存资料
                </Button>
                <p role="status">{saved}</p>
              </div>
            </form>
          </TabsContent>
        </Tabs>
        <footer>
          <span>CAREER DESK</span>
          <span>事实优先 · 保留来源 · 不自动投递</span>
        </footer>
      </main>
    </div>
  );
}

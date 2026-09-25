'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
export type EdgeState = {
  installed: boolean;
  connected: boolean;
  lastSeen: string;
  job?: {
    kind?: 'official' | 'community';
    status: string;
    reason: string;
    count: number;
    target?: number;
  } | null;
  last?: {
    kind?: 'official' | 'community';
    status: string;
    reason: string;
    count: number;
    target?: number;
    checkedAt: string;
  } | null;
};
export function EdgeConnection({
  edge,
  token,
  company,
  url,
}: {
  edge?: EdgeState;
  token: string;
  company: string;
  url: string;
}) {
  const [message, setMessage] = useState('');
  async function test() {
    try {
      const r = await fetch('/api/edge/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Career-Token': token,
        },
        body: JSON.stringify({ company, url }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) throw Error(d.error);
      setMessage(
        url.includes('app.mokahr.com')
          ? '正在测试动态官网读取，不消耗 AI 模型额度。'
          : '正在测试小红书读取，不消耗 AI 模型额度。',
      );
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  const label = (row: { kind?: string; count: number; target?: number }) =>
    row.kind === 'official'
      ? `${row.count}/${row.target || 36} 个岗位详情`
      : `${row.count}/${row.target || 20} 篇原帖`;
  return (
    <section className="edge-connection" aria-label="Edge 自动读取">
      <div className="edge-heading">
        <strong>Edge 自动读取</strong>
        <span>
          {edge?.connected
            ? '已连接'
            : edge?.installed
              ? '等待 Edge 在线'
              : '首次连接'}
        </span>
      </div>
      <p>
        {edge?.connected
          ? '自动读取 Moka 等动态招聘页，并在每次研究中读取至少 20 篇小红书原帖。保持 Edge 开启。'
          : '连接一次，以后工作台可读取支持的动态招聘页和已登录的小红书。'}
      </p>
      {edge?.job && (
        <output className={edge.job.status === 'waiting_user' ? 'alert' : ''}>
          {edge.job.reason} · 已读 {label(edge.job)}
        </output>
      )}
      {!edge?.job && edge?.last && (
        <output>
          上次读取：{label(edge.last)}。{edge.last.reason}
        </output>
      )}
      <Button
        type="button"
        variant="outline"
        disabled={!edge?.connected || !!edge?.job || !company}
        onClick={test}
      >
        {url.includes('app.mokahr.com')
          ? '测试当前官网读取'
          : '测试当前公司读取'}
      </Button>
      <output>{message}</output>
      <details open={!edge?.installed}>
        <summary>首次安装与连接</summary>
        <ol>
          <li>
            在 Edge 地址栏输入 <code>edge://extensions</code>
            ，打开“开发人员模式”。
          </li>
          <li>
            选择“加载解压缩的扩展”，选中下面的文件夹：
            <p className="extension-path">
              '<项目根目录>/edge-extension
            </p>
          </li>
          <li>
            在 Edge
            打开本工作台，组件会自动连接。小红书登录或验证提示出现时，在专用标签页完成即可。
          </li>
          <li>更新连接组件文件后，在扩展程序页点击一次“重新加载”。</li>
        </ol>
        <small>
          动态官网只读取公开职位列表与详情；小红书登录凭据、密码和 Cookie
          都留在浏览器。读取受限时会保留进度并明确标注。
        </small>
      </details>
    </section>
  );
}

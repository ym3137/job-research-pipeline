# job-research-pipeline

> 一个本地运行的求职研究工作台。给一个公司招聘官网链接，它读取全量岗位与完整 JD、按硬性条件逐条筛选、输出多维横向比较——并且**为每一条结论标注它的证据来源等级**。

*A local-first job research workbench: crawls a company's careers site for the complete job list and full JDs, filters against hard requirements, and produces a multi-dimensional comparison in which **every claim carries an explicit evidence grade and source**. Built with Next.js-style RSC (vinext), a local Node orchestration server, and a browser bridge for pages that need a logged-in session.*

---

## 为什么做这个

求职信息的失真，通常不是因为信息太少，而是因为**分不清哪些是事实**。

招聘平台展示的薪资、论坛里的一条面经、公众号的二手转载、还有自己顺手做出的推断——混在一份笔记里，读起来都像结论。等到要做「投哪三个」这种不可逆决策时，你分不出哪条经得起追问。

这个工具的全部设计围绕一件事：**让每一条结论都能追溯到它的来源等级，并且让「不知道」保持为「不知道」。**

## 三个核心设计

### 1. 证据分级：每条事实都必须带来源

比较表里的每一格都是 `{ value, basis, source }` 三元组，`basis` 取自封闭枚举：

| 等级 | 含义 |
| --- | --- |
| `official` | 公司官网、官方公告、官方认证渠道、网申系统 |
| `platform` | 招聘/聚合平台数据。跨年份、跨城市不可当作本岗报价 |
| `sample` | 求职者或员工的个人叙述。必须提示样本偏差 |
| `inference` | 基于以上材料的判断。必须写明推断依据 |
| `unknown` | **没有可核验来源。留空，不用推测填补** |

`local/comparison.mjs` 里的校验会拒绝任何缺维度、或 `basis` 非 `unknown` 却没有 `https://` 来源的结果——**模型没法用一句「行业普遍水平约 X」蒙混过去**。

### 2. 覆盖范围必须显式披露

`local/research-evidence.mjs` 读取官方岗位清单时，逐页翻到 `已读取数 == 总数`，并校验：返回码、总数为非负整数、分页期间总数是否变化、是否出现重复 ID、JD 是否完整。

任何一项不通过，状态就是 `blocked`——**报告「读取受阻」，绝不返回「该公司没有岗位」**。

> 搜索引擎摘要显示 0、页面初始 HTML 里没有岗位、动态内容没加载完——这三种情况都不能推出「零岗位」。这条规则是踩过坑之后加的，见下方工程记录。

### 3. 投递上限决定推荐数量

`推荐目标 = 官方核实的投递上限 × 2`。可投 3 个就先比较 6 个，最后只投 3 个——多出来的一半是用来做横向比较的，不是建议全投。

上限只认官方来源。官网没写、写「不限」、或规则有歧义时，上限记 0、不给推荐数，并说明用户该怎样自行核实。**绝不按行业惯例猜测。**

## 来源访问披露

`local/source-disclosure.mjs` 会在报告最前面生成一张表，逐一记录每个实际尝试过的来源：

`已读取` · `部分读取` · `访问受限` · `未核实` · `未检索`

三条铁律写进了实现：

- 一个网站受限**不能**概括成「所有论坛受限」
- 搜索没找到结果**不能**猜成「被反爬拦截」
- 拿到内容但无法独立验证是 `未核实`，不是 `已读取`

社区交叉验证只有在**实际打开并比对了专业论坛与非广告社媒内容**之后才标记为完成；否则整份报告降级为「部分完成」，而不是包装成全面验证。

## 架构

```
app/                    前端（React Server Components / vinext）
  page.tsx              工作台主界面：任务发起、结果展示、简历库
  job-comparison.tsx    多维比较表与成长性维度切换
  source-status.tsx     来源访问状态披露
  edge-connection.tsx   浏览器桥接连接状态

local/
  server.mjs            本机编排服务：单任务串行、子进程生命周期、
                        JSON Schema 校验、结果一致性复核、可取消
  comparison.mjs        多维比较 schema 与校验
  source-disclosure.mjs 来源访问披露表生成
  research-evidence.mjs 官方接口全量分页读取 + 完整性校验 + 结果复核
  community.mjs         社区证据录入与来源域名白名单校验
  edge-bridge.mjs       与浏览器扩展的配对、轮询与取消
  quota.mjs             用量读取
  *.test.mjs            上述模块的单元测试

edge-extension/         Edge/Chrome 扩展：在已登录会话中读取需要登录的页面
config/profile.example.json  身份信息模板（真实配置不入库）
```

服务端做了几件值得一提的事：同一时刻只允许一个研究任务在跑；对用户提供的 URL 做协议与凭证校验；校验 Origin 与 `Sec-Fetch-Site` 防跨站；清理子进程环境变量中的 `*API_KEY` / `*TOKEN`；任务超时与用户主动取消都会回收子进程；服务重启后把中断的任务标记为 `interrupted` 而不是留在 `running`。

## 工程记录

[`求职工作台审查与修复记录.md`](./求职工作台审查与修复记录.md) 记录了一轮真实的自我审查——**包括推翻自己上一轮的结论**：

- 原流程只做静态文本抓取，把「动态内容尚未加载」误判为「该公司零岗位」
- 「链接校验通过」是过宽表述：字符串匹配不等于页面可用，实测拼接出的地址返回 404
- 后台只校验 JSON 类型与数量倍数，没有校验岗位是否真实存在、分页是否完整
- 访问不到某个社媒平台，却仍然使用统一的「已完成」状态

四条都已修复并补了测试。保留这份记录，是因为**一个研究工具最该展示的不是它答对了什么，而是它怎么发现自己答错了。**

## 本地运行

```bash
pnpm install
pnpm build                       # 构建前端到 dist/client
cp config/profile.example.json config/profile.json   # 填入自己的信息（不入库）
pnpm start                       # http://127.0.0.1:4318
```

需要本机的 Codex CLI 并以 ChatGPT 账号登录；不接受 API key 登录。服务仅监听 `127.0.0.1`。

## 隐私

个人求职档案、简历、任务记录与抓取到的原始数据全部保存在本机 `.local/`，已在 `.gitignore` 中排除，不会进入版本库。身份信息（姓名、联系方式、简历页眉）通过 `config/profile.json` 注入，同样不入库——仓库里只有 `config/profile.example.json` 模板。

## 边界

- 目前只为单一公司的官方接口实现了动态岗位适配器；其他站点走浏览器读取，覆盖不全时会如实标记，不据此声称零岗位。
- 不自动投递、不发送消息、不联系招聘方。最终提交始终由本人确认。
- 不绕过登录墙、验证码或平台风控。需要登录的来源由本人在浏览器中登录后读取。

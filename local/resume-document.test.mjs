import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const PYTHON = process.env.CAREER_PYTHON || 'python3';

test('resume parser keeps every section when the model uses level-two headings', () => {
  const markdown = `## 简历正文
# 候选人姓名
## 求职意向
**示例公司｜Growth Analyst-Product & Experimentation｜上海**
## 教育经历
**示例大学｜应用分析硕士**　某地｜2025–2026
## 实习经历
**示例集团 A｜数据分析实习生**　上海｜2024
- 分析生产数据
**示例集团 B｜数据分析实习生**　上海｜2023
- 分析业务数据
## 项目经历
**会员留存分析**　示例大学｜2025
- 建立会员分层
## 技能与语言
- **数据：** Python、SQL
## 领导力与荣誉
- **挑战杯：** 上海市二等奖
- **篮球队队长：** 连续两届冠军
## 未确认内容与使用边界
不进入简历正文。`;
  const code = `import json,sys
from resume_document import parse_resume
p=parse_resume(sys.stdin.read())
print(json.dumps({'target':p['target'],'counts':{k:len(v) for k,v in p['sections'].items()}},ensure_ascii=False))`;
  const result = spawnSync(PYTHON, ['-c', code], { cwd: 'local', input: markdown, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.match(parsed.target, /Growth Analyst/);
  assert.equal(parsed.counts['教育经历'], 1);
  assert.equal(parsed.counts['实习经历'], 2);
  assert.equal(parsed.counts['项目经历'], 1);
  assert.equal(parsed.counts['技能与语言'], 1);
  assert.equal(parsed.counts['领导力与荣誉'], 2);
});

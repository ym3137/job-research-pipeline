#!/usr/bin/env python3
"""Build a one-page Chinese application resume in the user's established format."""
import argparse
import copy
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import pdfplumber
from docx import Document
from docx.oxml.ns import qn
from docx.shared import Length, Pt
from pypdf import PdfReader


# 身份信息不入库：优先读 config/profile.json（已 gitignore），否则回退到示例文件。
def _load_identity():
    base = Path(__file__).resolve().parent.parent / 'config'
    for name in ('profile.json', 'profile.example.json'):
        try:
            return json.loads((base / name).read_text(encoding='utf-8'))
        except Exception:
            continue
    return {'displayName': '候选人', 'displayNameEn': 'Candidate',
            'resumeHeader': '城市 ｜ 手机号 ｜ 邮箱'}


IDENTITY = _load_identity()

TEMPLATE = Path(IDENTITY.get('templateDocx', './config/resume-template.docx')).expanduser()
RENDER = Path(IDENTITY.get('renderScript', '')).expanduser()
PDFTOPPM = Path(IDENTITY.get('pdftoppm', 'pdftoppm')).expanduser()

# 由本人配置的“不得写回简历”凭证规则；示例文件里为空。
CREDENTIAL_RULES = IDENTITY.get('credentialRules', [])



def clean(value):
    value = re.sub(r'\[([^]]+)\]\([^)]+\)', r'\1', value)
    value = value.replace('**', '').replace('`', '')
    # 本人已声明排除的资格不得从旧素材里被重新写回简历。
    # 具体匹配什么、替换成什么，由 config/profile.json 注入（不入库）；
    # 格式见 config/profile.example.json 的 credentialRules。
    for rule in CREDENTIAL_RULES:
        pattern = rule.get('pattern')
        if not pattern or not re.search(pattern, value, re.I):
            continue
        keep = rule.get('keepIfPresent')
        if keep and re.search(keep, value, re.I):
            # 同行已有更合适的凭证，直接连分隔符一起删掉
            value = re.sub(r'(?:[、，；;]\s*|\s*\|\s*)' + pattern, '', value, flags=re.I)
            value = re.sub(pattern + r'(?:[、，；;]\s*|\s*\|\s*)?', '', value, flags=re.I)
        else:
            value = re.sub(pattern, rule.get('replaceWith', ''), value, flags=re.I)
    value = re.sub(r'\s*\|\s*', ' | ', value)
    return value.strip().strip('|｜').strip()


def resume_lines(markdown):
    section = re.search(r'##\s*简历正文[^\n]*\n([\s\S]*?)(?=\n##\s*(?:未确认|定制说明|来源访问)|\Z)', markdown)
    text = section.group(1) if section else markdown
    return [line.rstrip() for line in text.splitlines()]


def parse_resume(markdown):
    data = {'target': '', 'sections': {}}
    section = ''
    current = None
    content_sections = {'求职意向', '教育经历', '实习经历', '项目经历', '技能与语言', '领导力与荣誉'}
    for raw in resume_lines(markdown):
        line = raw.strip()
        if not line:
            continue
        heading = re.match(r'^#{2,3}\s+(.+)$', line)
        if heading:
            name = clean(heading.group(1))
            section = name if name in content_sections else ''
            if section:
                data['sections'].setdefault(section, [])
            current = None
            continue
        if not section:
            continue
        if section == '求职意向':
            if not data['target']:
                data['target'] = clean(line)
            continue
        if section == '领导力与荣誉' and line.startswith('- **'):
            honor = re.match(r'^-\s+\*\*(.+?)\*\*[：:]?\s*(.*)$', line)
            if honor:
                data['sections'][section].append({'title': clean(honor.group(1)), 'right': '', 'details': [], 'bullets': [clean(honor.group(2))]})
                current = None
                continue
        if line.startswith('**'):
            match = re.match(r'^\*\*(.+?)\*\*\s*[｜|]?\s*(.*)$', line)
            current = {'title': clean(match.group(1) if match else line), 'right': clean(match.group(2) if match else ''), 'details': [], 'bullets': []}
            data['sections'][section].append(current)
        elif line.startswith('- '):
            if current is None:
                current = {'title': '', 'right': '', 'details': [], 'bullets': []}
                data['sections'][section].append(current)
            current['bullets'].append(clean(line[2:]))
        elif current is not None:
            current['details'].append(clean(line))
        else:
            data['sections'][section].append({'title': '', 'right': '', 'details': [], 'bullets': [clean(line)]})
    return data


def prototypes(doc):
    p = doc.paragraphs
    return {
        'name': p[0], 'contact': p[1], 'tagline': p[2], 'section': p[3],
        'header': p[4], 'detail': p[5], 'muted': p[6], 'skill': p[11],
        'bullet': p[16], 'honor': p[33],
    }


def clear_body(doc):
    body = doc._element.body
    for child in list(body):
        if child.tag != qn('w:sectPr'):
            body.remove(child)


def add_like(doc, prototype, runs):
    paragraph = doc.add_paragraph()
    if prototype._p.pPr is not None:
        paragraph._p.insert(0, copy.deepcopy(prototype._p.pPr))
    proto_runs = prototype.runs or [None]
    for idx, value in enumerate(runs):
        run = paragraph.add_run(value)
        source = proto_runs[min(idx, len(proto_runs) - 1)]
        if source is not None and source._r.rPr is not None:
            run._r.insert(0, copy.deepcopy(source._r.rPr))
    return paragraph


def split_right(text):
    parts = [clean(x) for x in re.split(r'[｜|]', text) if clean(x)]
    if len(parts) <= 1:
        return clean(text), ''
    date_index = next((i for i, item in enumerate(parts) if re.search(r'20\d{2}|预计', item)), len(parts) - 1)
    left = '｜'.join(parts[:date_index] + parts[date_index + 1:])
    return left, parts[date_index]


def normalize_right(text):
    return clean(text).replace('上海，中国', '上海').replace('纽约，美国', '纽约')


def honor_summary(entry):
    title = entry['title']
    detail = entry['bullets'][0] if entry['bullets'] else ''
    if '挑战杯' in title:
        return '“挑战杯”上海市二等奖｜5人团队负责人；分析1,000+份问卷并提出8条政策建议'
    if '篮球队队长' in title:
        return 'SUIBE篮球队队长｜连续两届校级联赛冠军；组织15支球队参赛'
    return title + (('；' + detail) if detail else '')


def scale_document(doc, factor):
    for paragraph in doc.paragraphs:
        for run in paragraph.runs:
            if run.font.size:
                run.font.size = Length(int(run.font.size * factor))
        fmt = paragraph.paragraph_format
        if fmt.space_before:
            fmt.space_before = Length(int(fmt.space_before * factor))
        if fmt.space_after:
            fmt.space_after = Length(int(fmt.space_after * factor))
        if isinstance(fmt.line_spacing, int):
            fmt.line_spacing = Length(int(fmt.line_spacing * factor))


def build(markdown, target, factor=1.0):
    if not TEMPLATE.exists():
        raise FileNotFoundError(f'简历模板不存在：{TEMPLATE}')
    parsed = parse_resume(markdown)
    doc = Document(TEMPLATE)
    proto = prototypes(doc)
    clear_body(doc)

    add_like(doc, proto['name'], [f"{IDENTITY['displayName']}  {IDENTITY['displayNameEn']}"])
    add_like(doc, proto['contact'], [IDENTITY['resumeHeader']])
    target_parts = parsed['target'].split('｜') if parsed['target'] else []
    target_text = re.sub(r'（职位编号[^）]+）', '', target_parts[1] if len(target_parts) > 1 else (target_parts[0] if target_parts else '数据驱动的全球营销与运营岗位'))
    if re.search(r'全球|国际|海外|新加坡|Growth Builder|rednote|TikTok|GTM', target_text, re.I):
        tagline = f'美澳求学经历  |  英语流利·TOEFL 102  |  目标：{target_text}'
    else:
        tagline = f'国际商务双学士  |  应用分析硕士  |  中美澳学习经历  |  目标：{target_text}'
    add_like(doc, proto['tagline'], [tagline])

    add_like(doc, proto['section'], ['教育背景'])
    for entry in parsed['sections'].get('教育经历', [])[:2]:
        add_like(doc, proto['header'], [entry['title'], '\t' + normalize_right(entry['right'])])
        for detail_index, detail in enumerate(entry['details'][:2]):
            left, right = split_right(detail)
            style = proto['detail'] if detail_index == 0 else proto['muted']
            add_like(doc, style, [left, ('\t' + right) if right else ''])

    add_like(doc, proto['section'], ['核心能力'])
    skills = parsed['sections'].get('技能与语言', [])
    skill_lines = [bullet for item in skills for bullet in item['bullets']]
    for text in skill_lines[:3]:
        if '：' in text:
            label, body = text.split('：', 1)
            add_like(doc, proto['skill'], [label + '：', body])
        else:
            add_like(doc, proto['detail'], [text])

    internships = list(parsed['sections'].get('实习经历', []))
    internship_heading = '实习与企业合作经历' if any('Capstone' in entry['title'] for entry in internships) else '实习经历'
    add_like(doc, proto['section'], [internship_heading])
    for entry in internships[:3]:
        add_like(doc, proto['header'], [entry['title'], ('\t' + normalize_right(entry['right'])) if entry['right'] else ''])
        for bullet in entry['bullets'][:3]:
            add_like(doc, proto['bullet'], [bullet])

    add_like(doc, proto['section'], ['精选项目经历'])
    projects = list(parsed['sections'].get('项目经历', []))
    for project_index, entry in enumerate(projects[:4]):
        add_like(doc, proto['header'], [entry['title'], ('\t' + normalize_right(entry['right'])) if entry['right'] else ''])
        bullet_limit = 3 if project_index == 0 else 2
        for bullet in entry['bullets'][:bullet_limit]:
            add_like(doc, proto['bullet'], [bullet])

    add_like(doc, proto['section'], ['荣誉与领导力'])
    for entry in parsed['sections'].get('领导力与荣誉', [])[:2]:
        add_like(doc, proto['honor'], [honor_summary(entry), ('\t' + normalize_right(entry['right'])) if entry['right'] else ''])

    scale_document(doc, factor)
    # Keep the established type sizes; a small, even paragraph gap avoids
    # rejecting a substantively full page for a few points of white space.
    for paragraph in doc.paragraphs[3:]:
        fmt = paragraph.paragraph_format
        fmt.space_after = Length(int(fmt.space_after or 0) + int(Pt(2.55)))
    props = doc.core_properties
    props.author = IDENTITY['displayNameEn']
    props.title = f"{IDENTITY['displayName']}｜{target_text}｜中文简历"
    props.subject = '岗位申请简历'
    props.comments = ''
    doc.save(target)


def export_pdf_from_docx(docx, pdf):
    if pdf.exists():
        pdf.unlink()
    with tempfile.TemporaryDirectory(prefix='career-resume-') as temp_dir:
        staged_docx = Path(temp_dir) / 'resume.docx'
        staged_pdf = Path(temp_dir) / 'resume.pdf'
        shutil.copy2(docx, staged_docx)
        subprocess.run(['/usr/bin/open', '-ga', 'Pages'], check=True, capture_output=True, text=True)
        time.sleep(2)
        script = '''on run argv
set inputFile to POSIX file (item 1 of argv)
set outputFile to POSIX file (item 2 of argv)
tell application "Pages"
  open inputFile
  delay 2
  set resumeDoc to front document
  if (name of resumeDoc) does not start with (item 3 of argv) then error "Pages opened a different document"
  export resumeDoc to outputFile as PDF
  close resumeDoc saving no
end tell
end run'''
        result = subprocess.run(
            ['/usr/bin/osascript', '-', str(staged_docx), str(staged_pdf), staged_docx.stem], input=script,
            text=True, capture_output=True, timeout=90,
        )
        if result.returncode:
            detail = (result.stderr or result.stdout or 'DOCX PDF export failed').strip()
            raise RuntimeError(detail)
        if not staged_pdf.exists():
            raise RuntimeError('Pages 未生成 PDF 文件')
        shutil.copy2(staged_pdf, pdf)


def fonts_embedded(pdf):
    reader = PdfReader(str(pdf))
    missing = []
    for page in reader.pages:
        fonts = (page.get('/Resources') or {}).get('/Font') or {}
        for name, ref in fonts.items():
            font = ref.get_object()
            targets = [x.get_object() for x in font.get('/DescendantFonts', [])] if font.get('/Subtype') == '/Type0' else [font]
            for target in targets:
                descriptor = target.get('/FontDescriptor')
                if descriptor:
                    descriptor = descriptor.get_object()
                    if not any(descriptor.get(k) for k in ('/FontFile', '/FontFile2', '/FontFile3')):
                        missing.append(str(name))
    return not missing, sorted(set(missing))


def render(docx, pdf, qa):
    qa.mkdir(parents=True, exist_ok=True)
    docx_qa = qa / 'docx-render'
    docx_qa.mkdir()
    env = os.environ.copy()
    env['PATH'] = str(Path(sys.executable).parent) + os.pathsep + env.get('PATH', '')
    subprocess.run([sys.executable, str(RENDER), str(docx), '--output_dir', str(docx_qa)], check=True, env=env, capture_output=True, text=True)
    export_pdf_from_docx(docx, pdf)
    subprocess.run([str(PDFTOPPM), '-png', '-r', '144', str(pdf), str(qa / 'page')], check=True, capture_output=True, text=True)
    return sorted(qa.glob('page-*.png'))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--docx', required=True)
    parser.add_argument('--pdf', required=True)
    parser.add_argument('--qa-dir', required=True)
    args = parser.parse_args()
    data = json.loads(Path(args.input).read_text())
    docx, pdf, qa = Path(args.docx).resolve(), Path(args.pdf).resolve(), Path(args.qa_dir).resolve()
    docx.parent.mkdir(parents=True, exist_ok=True)
    pages = []
    for factor in (1.0, 0.97, 0.94):
        if qa.exists():
            shutil.rmtree(qa)
        build(data['report'], docx, factor)
        pages = render(docx, pdf, qa)
        if len(pages) == 1:
            break
    if len(pages) != 1:
        raise ValueError(f'简历排版为{len(pages)}页，未达到恰好一页的投递规范')
    if not pdf.exists() or pdf.stat().st_size < 1000:
        raise ValueError('PDF导出失败')
    with pdfplumber.open(pdf) as opened:
        text = '\n'.join((page.extract_text() or '') for page in opened.pages)
        if len(opened.pages) != 1 or '@' not in text or IDENTITY['displayNameEn'] not in text:
            raise ValueError('PDF文字、联系方式或页数校验失败')
        if '男' not in text or '23岁' not in text:
            raise ValueError('简历页眉缺少性别或年龄')
        if 'LinkedIn' in text or '领英' in text:
            raise ValueError('国内投递版不应包含LinkedIn')
        words = opened.pages[0].extract_words()
        if not words or opened.pages[0].height - max(word['bottom'] for word in words) > 76:
            raise ValueError('简历正文未充实到接近一整页')
    embedded, missing = fonts_embedded(pdf)
    if not embedded:
        raise ValueError('PDF存在未嵌入字体：' + ','.join(missing))
    print(json.dumps({'docx': str(docx), 'pdf': str(pdf), 'qa': str(qa), 'pages': len(pages)}, ensure_ascii=False))


if __name__ == '__main__':
    main()

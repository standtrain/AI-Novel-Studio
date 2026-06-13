const path = require('path');
const novelDao = require('../dao/novelDao');
const chapterDao = require('../dao/chapterDao');
const characterDao = require('../dao/characterDao');
const { createLogger } = require('../utils/logger');

const logger = createLogger('export-service');

// ====== 数据获取 ======
async function fetchExportData(novelId, userId) {
  const novel = await novelDao.findById(novelId);
  if (!novel) {
    const err = new Error('小说不存在');
    err.status = 404;
    throw err;
  }
  // 所有权校验
  if (novel.user_id !== userId) {
    const err = new Error('无权访问该小说');
    err.status = 403;
    throw err;
  }

  const [characters, chapters] = await Promise.all([
    characterDao.findByNovelId(novelId),
    chapterDao.findByNovelId(novelId),
  ]);

  // JSON 字段安全解析
  let subPlots = [];
  try { subPlots = JSON.parse(novel.sub_plots || '[]'); } catch { /* keep empty */ }

  return {
    novel: {
      ...novel,
      sub_plots: Array.isArray(subPlots) ? subPlots : [],
    },
    characters: characters.map(c => {
      let relationships = [];
      try { relationships = JSON.parse(c.relationships || '[]'); } catch { /* keep empty */ }
      return { ...c, relationships };
    }),
    chapters: chapters.map(ch => {
      let scenes = [];
      let charactersInvolved = [];
      try { scenes = JSON.parse(ch.scenes || '[]'); } catch { /* keep empty */ }
      try { charactersInvolved = JSON.parse(ch.characters_involved || '[]'); } catch { /* keep empty */ }
      return { ...ch, scenes, characters_involved: charactersInvolved };
    }),
  };
}

// ====== 范围筛选 ======
function filterByScope(data, scope, options) {
  switch (scope) {
    case 'full':
      return { ...data };
    case 'outline':
      return { novel: data.novel, characters: data.characters, chapters: [] };
    case 'chapter': {
      const target = data.chapters.find(c => c.chapter_number === options.chapterNum);
      if (!target) {
        const err = new Error(`第${options.chapterNum}章不存在`);
        err.status = 404;
        throw err;
      }
      return { novel: data.novel, characters: [], chapters: [target] };
    }
    case 'range': {
      let from, to;
      if (options.chapters) {
        // 章节范围只接受“起始章-结束章”的正整数字符串，避免 1-5abc 被宽松解析为 1-5
        const match = String(options.chapters).trim().match(/^([1-9]\d*)-([1-9]\d*)$/);
        if (match) {
          from = Number(match[1]);
          to = Number(match[2]);
        }
      } else {
        from = options.chapterFrom || 1;
        to = options.chapterTo || data.chapters.length;
      }
      if (isNaN(from) || isNaN(to) || from < 1 || to > data.chapters.length || from > to) {
        const err = new Error(`章节范围无效：${from}-${to}（共${data.chapters.length}章）`);
        err.status = 400;
        throw err;
      }
      const filtered = data.chapters.filter(c => c.chapter_number >= from && c.chapter_number <= to);
      return { novel: data.novel, characters: data.characters, chapters: filtered };
    }
    default:
      return { ...data };
  }
}

// ====== 安全文件名 ======
function safeFilename(title, scope, ext) {
  const safe = title.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_').substring(0, 50);
  const suffix = scope !== 'full' ? `_${scope}` : '';
  return `${safe}${suffix}.${ext}`;
}

// ====== TXT 生成 ======
function generateTXT(data) {
  const lines = [];
  const { novel, characters, chapters } = data;

  lines.push(`《${novel.title || '未命名'}》`);
  if (novel.genre) lines.push(`类型：${novel.genre}`);
  if (novel.theme) lines.push(`主题：${novel.theme}`);
  lines.push('');

  if (novel.setting) {
    lines.push('═══════════════════════════════');
    lines.push('  世界观 / 背景设定');
    lines.push('═══════════════════════════════');
    lines.push(novel.setting);
    lines.push('');
  }

  if (novel.main_plot) {
    lines.push('═══════════════════════════════');
    lines.push('  主线剧情');
    lines.push('═══════════════════════════════');
    lines.push(novel.main_plot);
    lines.push('');
  }

  if (novel.sub_plots && novel.sub_plots.length > 0) {
    lines.push('  支线剧情');
    lines.push('───────────────────────────────');
    novel.sub_plots.forEach((sp, i) => {
      lines.push(`${i + 1}. ${sp}`);
    });
    lines.push('');
  }

  if (characters.length > 0) {
    lines.push('═══════════════════════════════');
    lines.push('  人物设定');
    lines.push('═══════════════════════════════');
    lines.push('');
    characters.forEach((ch, i) => {
      lines.push(`【${ch.name || '未命名'}】`);
      if (ch.age) lines.push(`年龄：${ch.age}`);
      if (ch.gender) lines.push(`性别：${ch.gender}`);
      if (ch.role) lines.push(`身份：${ch.role}`);
      if (ch.appearance) lines.push(`外貌：${ch.appearance}`);
      if (ch.personality) lines.push(`性格：${ch.personality}`);
      if (ch.background) lines.push(`背景：${ch.background}`);
      if (ch.motivation) lines.push(`动机：${ch.motivation}`);
      if (ch.arc) lines.push(`成长弧：${ch.arc}`);
      if (ch.relationships && ch.relationships.length > 0) {
        lines.push(`关系：${ch.relationships.join('；')}`);
      }
      if (i < characters.length - 1) lines.push('');
    });
    lines.push('');
  }

  if (chapters.length > 0) {
    lines.push('═══════════════════════════════');
    lines.push('  正文');
    lines.push('═══════════════════════════════');
    lines.push('');
    chapters.forEach(ch => {
      lines.push(`第${ch.chapter_number}章 ${ch.title || ''}`);
      lines.push('───────────────────────────────');
      if (ch.content) {
        lines.push(ch.content);
      }
      if (ch.word_count) lines.push(`（字数：${ch.word_count}）`);
      lines.push('');
    });
  }

  return Buffer.from(lines.join('\r\n'), 'utf-8');
}

// ====== DOCX 生成 ======
async function generateDOCX(data) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType } = require('docx');
  const { novel, characters, chapters } = data;

  const children = [];

  // 标题页
  children.push(new Paragraph({
    text: novel.title || '未命名小说',
    heading: HeadingLevel.HEADING_1,
    alignment: AlignmentType.CENTER,
    spacing: { after: 300 },
  }));

  if (novel.genre || novel.theme) {
    const meta = [];
    if (novel.genre) meta.push(`类型：${novel.genre}`);
    if (novel.theme) meta.push(`主题：${novel.theme}`);
    children.push(new Paragraph({
      children: meta.map((t, i) => new TextRun({ text: t + (i < meta.length - 1 ? '    ' : ''), size: 24 })),
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    }));
  }

  // 大纲部分
  if (novel.setting || novel.main_plot) {
    children.push(new Paragraph({ text: '大纲', heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 200 } }));

    if (novel.setting) {
      children.push(new Paragraph({ text: '世界观 / 背景设定', heading: HeadingLevel.HEADING_3 }));
      splitParagraphs(novel.setting).forEach(p => {
        children.push(new Paragraph({ children: [new TextRun({ text: p, size: 24 })], spacing: { after: 100 } }));
      });
    }

    if (novel.main_plot) {
      children.push(new Paragraph({ text: '主线剧情', heading: HeadingLevel.HEADING_3 }));
      splitParagraphs(novel.main_plot).forEach(p => {
        children.push(new Paragraph({ children: [new TextRun({ text: p, size: 24 })], spacing: { after: 100 } }));
      });
    }

    if (novel.sub_plots && novel.sub_plots.length > 0) {
      children.push(new Paragraph({ text: '支线剧情', heading: HeadingLevel.HEADING_3 }));
      novel.sub_plots.forEach(sp => {
        children.push(new Paragraph({ children: [new TextRun({ text: `• ${sp}`, size: 24 })], spacing: { after: 60 } }));
      });
    }
  }

  // 人物设定
  if (characters.length > 0) {
    children.push(new Paragraph({ text: '人物设定', heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 200 } }));

    characters.forEach(ch => {
      children.push(new Paragraph({ text: ch.name || '未命名', heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 100 } }));

      const fields = [];
      if (ch.age) fields.push(`年龄：${ch.age}`);
      if (ch.gender) fields.push(`性别：${ch.gender}`);
      if (ch.role) fields.push(`身份：${ch.role}`);
      fields.forEach(f => {
        children.push(new Paragraph({ children: [new TextRun({ text: f, size: 22 })], spacing: { after: 60 } }));
      });

      const longFields = [
        { label: '外貌', value: ch.appearance },
        { label: '性格', value: ch.personality },
        { label: '背景', value: ch.background },
        { label: '动机', value: ch.motivation },
        { label: '成长弧', value: ch.arc },
      ];
      longFields.forEach(({ label, value }) => {
        if (value) {
          splitParagraphs(value).forEach(p => {
            children.push(new Paragraph({ children: [new TextRun({ text: `${label}：${p}`, size: 22 })], spacing: { after: 60 } }));
          });
        }
      });

      if (ch.relationships && ch.relationships.length > 0) {
        children.push(new Paragraph({ children: [new TextRun({ text: `关系：${ch.relationships.join('；')}`, size: 22 })], spacing: { after: 100 } }));
      }
    });
  }

  // 章节正文
  if (chapters.length > 0) {
    children.push(new Paragraph({ text: '正文', heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 200 } }));

    chapters.forEach(ch => {
      children.push(new Paragraph({ text: `第${ch.chapter_number}章 ${ch.title || ''}`, heading: HeadingLevel.HEADING_3, spacing: { before: 300, after: 150 } }));

      if (ch.content) {
        splitParagraphs(ch.content).forEach(p => {
          children.push(new Paragraph({ children: [new TextRun({ text: p, size: 24 })], spacing: { after: 100 } }));
        });
      }

      if (ch.word_count) {
        children.push(new Paragraph({
          children: [new TextRun({ text: `（字数：${ch.word_count}）`, size: 20, italics: true })],
          spacing: { after: 200 },
        }));
      }
    });
  }

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: 'SimSun', size: 24 },
        },
      },
    },
    sections: [{ children }],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

// 将长文本按段落分割（用于 DOCX 生成）
function splitParagraphs(text) {
  if (!text) return [''];
  // 先按双换行分，再对过长的段按单换行分
  const parts = text.split(/\n\n+/);
  const result = [];
  for (const part of parts) {
    if (part.length > 500) {
      result.push(...part.split(/\n/).filter(s => s.trim()));
    } else if (part.trim()) {
      result.push(part.trim());
    }
  }
  return result.length > 0 ? result : [text];
}

// ====== PDF 生成 ======
async function generatePDF(data) {
  const PDFDocument = require('pdfkit');
  const { novel, characters, chapters } = data;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 60, right: 60 },
      info: { Title: novel.title || '未命名小说' },
    });

    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // 注册中文字体
    const fontPaths = [
      path.join(__dirname, '../../assets/fonts/NotoSansSC-Regular.ttf'),
      path.join(__dirname, '../../assets/fonts/SourceHanSansSC-Regular.otf'),
    ];
    const fs = require('fs');
    let fontRegistered = false;
    for (const fp of fontPaths) {
      if (fs.existsSync(fp)) {
        doc.registerFont('CJK', fp);
        doc.font('CJK');
        fontRegistered = true;
        break;
      }
    }
    if (!fontRegistered) {
      // 缺少中文字体时直接报错，避免生成无法显示中文的 PDF 文件误导用户
      reject(Object.assign(
        new Error('PDF 导出失败：服务器缺少中文字体文件，请联系管理员将字体放入 backend/assets/fonts/'),
        { status: 500 }
      ));
      return;
    }

    // 封面标题
    doc.fontSize(22).text(novel.title || '未命名小说', { align: 'center' });
    doc.moveDown(0.5);
    if (novel.genre || novel.theme) {
      doc.fontSize(12);
      const meta = [];
      if (novel.genre) meta.push(`类型：${novel.genre}`);
      if (novel.theme) meta.push(`主题：${novel.theme}`);
      doc.text(meta.join('    '), { align: 'center' });
    }
    doc.moveDown(1);

    // 大纲
    if (novel.setting || novel.main_plot) {
      doc.fontSize(16).text('大纲', { underline: true });
      doc.moveDown(0.5);

      if (novel.setting) {
        doc.fontSize(13).text('世界观 / 背景设定', { underline: true });
        doc.moveDown(0.3);
        doc.fontSize(11).text(novel.setting, { width: doc.page.width - doc.page.margins.left - doc.page.margins.right });
        doc.moveDown(0.5);
      }

      if (novel.main_plot) {
        doc.fontSize(13).text('主线剧情', { underline: true });
        doc.moveDown(0.3);
        doc.fontSize(11).text(novel.main_plot, { width: doc.page.width - doc.page.margins.left - doc.page.margins.right });
        doc.moveDown(0.5);
      }

      if (novel.sub_plots && novel.sub_plots.length > 0) {
        doc.fontSize(13).text('支线剧情', { underline: true });
        doc.moveDown(0.3);
        novel.sub_plots.forEach(sp => {
          doc.fontSize(11).text(`• ${sp}`);
        });
        doc.moveDown(0.5);
      }
    }

    // 人物设定
    if (characters.length > 0) {
      doc.addPage();
      doc.fontSize(16).text('人物设定', { underline: true });
      doc.moveDown(0.5);

      characters.forEach((ch, i) => {
        if (i > 0) doc.moveDown(0.3);
        doc.fontSize(13).text(ch.name || '未命名', { underline: true });
        doc.moveDown(0.2);

        const fields = [];
        if (ch.age) fields.push(`年龄：${ch.age}`);
        if (ch.gender) fields.push(`性别：${ch.gender}`);
        if (ch.role) fields.push(`身份：${ch.role}`);
        if (fields.length > 0) {
          doc.fontSize(11).text(fields.join('    '));
        }

        if (ch.appearance) { doc.moveDown(0.2); doc.fontSize(11).text(`外貌：${ch.appearance}`); }
        if (ch.personality) { doc.moveDown(0.2); doc.fontSize(11).text(`性格：${ch.personality}`); }
        if (ch.background) { doc.moveDown(0.2); doc.fontSize(11).text(`背景：${ch.background}`); }
        if (ch.motivation) { doc.moveDown(0.2); doc.fontSize(11).text(`动机：${ch.motivation}`); }
        if (ch.arc) { doc.moveDown(0.2); doc.fontSize(11).text(`成长弧：${ch.arc}`); }
        if (ch.relationships && ch.relationships.length > 0) {
          doc.moveDown(0.2);
          doc.fontSize(11).text(`关系：${ch.relationships.join('；')}`);
        }
      });
    }

    // 章节正文
    if (chapters.length > 0) {
      chapters.forEach((ch, i) => {
        doc.addPage();
        doc.fontSize(14).text(`第${ch.chapter_number}章 ${ch.title || ''}`, { align: 'center' });
        doc.moveDown(0.8);

        if (ch.content) {
          doc.fontSize(11).text(ch.content, {
            width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
            lineGap: 4,
          });
        }

        if (ch.word_count) {
          doc.moveDown(0.5);
          doc.fontSize(9).text(`（字数：${ch.word_count}）`, { align: 'right', oblique: true });
        }
      });
    }

    doc.end();
  });
}

// ====== EPUB 生成 ======
async function generateEPUB(data) {
  const Epub = require('epub-gen');
  const { novel, characters, chapters } = data;

  const content = [];

  // 大纲章节
  let outlineHTML = '';
  if (novel.setting) outlineHTML += `<h3>世界观 / 背景设定</h3><p>${escapeHTML(novel.setting).replace(/\n/g, '<br/>')}</p>`;
  if (novel.main_plot) outlineHTML += `<h3>主线剧情</h3><p>${escapeHTML(novel.main_plot).replace(/\n/g, '<br/>')}</p>`;
  if (novel.sub_plots && novel.sub_plots.length > 0) {
    outlineHTML += '<h3>支线剧情</h3><ul>';
    novel.sub_plots.forEach(sp => { outlineHTML += `<li>${escapeHTML(sp)}</li>`; });
    outlineHTML += '</ul>';
  }
  if (outlineHTML) {
    content.push({ title: '大纲', data: outlineHTML });
  }

  // 人物设定章节
  if (characters.length > 0) {
    let charHTML = '';
    characters.forEach(ch => {
      charHTML += `<h3>${escapeHTML(ch.name || '未命名')}</h3><ul>`;
      if (ch.age) charHTML += `<li>年龄：${escapeHTML(String(ch.age))}</li>`;
      if (ch.gender) charHTML += `<li>性别：${escapeHTML(ch.gender)}</li>`;
      if (ch.role) charHTML += `<li>身份：${escapeHTML(ch.role)}</li>`;
      if (ch.appearance) charHTML += `<li>外貌：${escapeHTML(String(ch.appearance))}</li>`;
      if (ch.personality) charHTML += `<li>性格：${escapeHTML(String(ch.personality))}</li>`;
      if (ch.background) charHTML += `<li>背景：${escapeHTML(String(ch.background))}</li>`;
      if (ch.motivation) charHTML += `<li>动机：${escapeHTML(String(ch.motivation))}</li>`;
      if (ch.arc) charHTML += `<li>成长弧：${escapeHTML(String(ch.arc))}</li>`;
      if (ch.relationships && ch.relationships.length > 0) {
        charHTML += `<li>关系：${escapeHTML(ch.relationships.join('；'))}</li>`;
      }
      charHTML += '</ul><br/>';
    });
    content.push({ title: '人物设定', data: charHTML });
  }

  // 各章节
  chapters.forEach(ch => {
    const title = `第${ch.chapter_number}章 ${ch.title || ''}`;
    let html = `<h2>第${ch.chapter_number}章 ${escapeHTML(ch.title || '')}</h2>`;
    if (ch.content) {
      html += escapeHTML(ch.content).replace(/\n/g, '<br/>');
    }
    content.push({ title, data: html });
  });

  const options = {
    title: novel.title || '未命名小说',
    author: 'AI Novel Studio',
    content,
    css: `
      body { font-family: 'Noto Sans SC', 'SimSun', serif; line-height: 1.8; }
      h2 { text-align: center; margin-top: 1.5em; }
      h3 { margin-top: 1em; }
      p { text-indent: 2em; margin: 0.5em 0; }
      ul { margin: 0.5em 0; padding-left: 2em; }
      li { margin: 0.3em 0; }
    `,
  };

  // epub-gen 需要输出文件路径，写入临时文件后读取
  const os = require('os');
  const fs = require('fs');
  const tmpPath = path.join(os.tmpdir(), `epub_${Date.now()}_${Math.random().toString(36).substring(2, 10)}.epub`);
  const epub = new Epub(options, tmpPath);
  let buf;
  try {
    await epub.promise;
    buf = fs.readFileSync(tmpPath);
  } finally {
    // 同步清理临时文件，避免并发导出时的清理竞态导致磁盘泄漏
    try {
      fs.unlinkSync(tmpPath);
    } catch (err) {
      // 文件可能已被清理或不存在，仅记录不抛出
      if (err && err.code !== 'ENOENT') {
        logger.warn({ tmpPath, code: err.code, msg: err.message }, 'EPUB 临时文件清理失败');
      }
    }
  }
  return buf;
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ====== 主入口 ======
async function generateExport(format, scope, novelId, userId, options = {}) {
  // 格式校验
  const validFormats = ['txt', 'docx', 'pdf', 'epub', 'json'];
  if (!validFormats.includes(format)) {
    const err = new Error('不支持的导出格式');
    err.status = 400;
    throw err;
  }

  // 范围校验
  const validScopes = ['full', 'outline', 'chapter', 'range'];
  if (!validScopes.includes(scope)) {
    const err = new Error('不支持的导出范围');
    err.status = 400;
    throw err;
  }
  if (scope === 'chapter' && !options.chapterNum) {
    const err = new Error('请指定章节号');
    err.status = 400;
    throw err;
  }
  if (scope === 'range' && !options.chapters) {
    const err = new Error('请指定章节范围（如 chapters=1-5）');
    err.status = 400;
    throw err;
  }

  // 获取并筛选数据
  const data = await fetchExportData(novelId, userId);
  const filtered = filterByScope(data, scope, { ...options, chapterNum: options.chapterNum });

  // 按格式生成
  let buffer, mimeType, ext;
  switch (format) {
    case 'txt':
      buffer = generateTXT(filtered);
      mimeType = 'text/plain; charset=utf-8';
      ext = 'txt';
      break;
    case 'docx':
      buffer = await generateDOCX(filtered);
      mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      ext = 'docx';
      break;
    case 'pdf':
      buffer = await generatePDF(filtered);
      mimeType = 'application/pdf';
      ext = 'pdf';
      break;
    case 'epub':
      buffer = await generateEPUB(filtered);
      mimeType = 'application/epub+zip';
      ext = 'epub';
      break;
    case 'json':
      // 结构化 JSON 导出，支持重新导入
      buffer = Buffer.from(JSON.stringify({ version: 1, ...filtered }, null, 2), 'utf-8');
      mimeType = 'application/json; charset=utf-8';
      ext = 'json';
      break;
    default:
      buffer = Buffer.alloc(0);
      mimeType = 'application/octet-stream';
      ext = 'bin';
  }

  const filename = safeFilename(data.novel.title || '未命名', scope, ext);

  return { buffer, mimeType, filename };
}

module.exports = { generateExport };

import {
  AlignmentType, Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, WidthType,
} from 'docx';
import { dataMarker, usableReferences } from '../shared/project.mjs';

const plain = value => value.trim().replace(/^#{1,6}\s+/, '').replace(/\*\*/g, '');
const heading = (text, pageBreakBefore = false) =>
  new Paragraph({ text, heading: HeadingLevel.HEADING_1, pageBreakBefore });
const paragraph = (text, options = {}) => new Paragraph({
  text, spacing: { after: 120, line: 340 }, ...options,
});

function markdownCells(line) {
  return line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(cell => plain(cell.replace(/\\\|/g, '|')));
}

function table(rows) {
  const width = Math.max(...rows.map(row => row.length));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((row, index) => new TableRow({
      tableHeader: index === 0,
      children: Array.from({ length: width }, (_, col) => new TableCell({
        ...(index === 0 ? { shading: { fill: 'E6ECF6' } } : {}),
        margins: { top: 100, bottom: 100, left: 110, right: 110 },
        children: [paragraph(row[col] || '', { spacing: { after: 0 } })],
      })),
    })),
  });
}

function toBlocks(value, isInstrument = false) {
  const lines = value.split(/\r?\n/);
  const blocks = [];
  let hasTable = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const separator = lines[i + 1]?.trim() || '';
    if (line.includes('|') && separator.includes('|') && /^[\s|:\-]+$/.test(separator) && separator.includes('-')) {
      const rows = [markdownCells(line)];
      i++;
      while (lines[i + 1]?.trim().includes('|')) {
        rows.push(markdownCells(lines[++i]));
      }
      blocks.push(table(rows));
      hasTable = true;
    } else if (/^#{1,6}\s/.test(line)) {
      blocks.push(new Paragraph({ text: plain(line), heading: HeadingLevel.HEADING_2 }));
    } else {
      blocks.push(paragraph(plain(line), { alignment: AlignmentType.JUSTIFIED }));
    }
  }
  if (isInstrument && !hasTable) {
    const items = lines.map(plain).filter(Boolean);
    return [table([['No.', 'Butir / uraian instrumen'], ...items.map((line, index) => [String(index + 1), line])])];
  }
  return blocks;
}

export function buildWord(project, kind) {
  const title = project.title.trim() || (kind === 'instrument' ? 'Instrumen Penelitian' : 'Karya Ilmiah');
  const children = [new Paragraph({ text: title, heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER })];
  if (kind !== 'instrument') {
    for (const [index, chapter] of project.chapters.entries()) {
      children.push(heading(chapter.chapter + ' – ' + chapter.heading, true));
      if (index === 0 && project.questions.trim()) {
        children.push(new Paragraph({ text: 'Pertanyaan Penelitian', heading: HeadingLevel.HEADING_2 }));
        children.push(...toBlocks(project.questions));
      }
      const content = chapter.content.trim() || (index === 3 ? dataMarker : '');
      children.push(...toBlocks(content));
    }
  }
  if (project.instrument.trim()) {
    children.push(heading('INSTRUMEN PENELITIAN', kind !== 'instrument'));
    children.push(...toBlocks(project.instrument, true));
  }
  if (kind !== 'instrument') {
    children.push(heading('DAFTAR PUSTAKA', true));
    const numbered = ['IEEE', 'Vancouver', 'AMA'].includes(project.citationStyle);
    const refs = usableReferences(project.refs).slice();
    if (!numbered) refs.sort((a, b) => (a.authors || a.title).localeCompare(b.authors || b.title, 'id'));
    refs.forEach((ref, index) => {
      const source = [ref.authors, ref.year && '(' + ref.year + ')', ref.title, ref.publisher]
        .filter(Boolean).map(value => value.replace(/\.$/, '') + '.').join(' ');
      children.push(paragraph((numbered ? '[' + (index + 1) + '] ' : '') + source + (ref.url ? ' ' + ref.url : ''), {
        indent: { left: 426, hanging: 426 },
      }));
    });
  }
  const document = new Document({
    styles: { default: { document: { run: { font: 'Times New Roman', size: 24 } } } },
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1701, bottom: 1701, left: 2268, right: 1701 } } }, children }],
  });
  const safeTitle = title.replace(/[^\p{L}\p{N}\-_ ]/gu, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'risetai';
  return { document, fileName: safeTitle + (kind === 'instrument' ? '-instrumen' : '') + '.docx' };
}

export async function downloadWord(project, kind) {
  const { document, fileName } = buildWord(project, kind);
  const url = URL.createObjectURL(await Packer.toBlob(document));
  const link = window.document.createElement('a');
  link.href = url;
  link.download = fileName;
  window.document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

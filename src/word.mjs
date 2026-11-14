import {
  AlignmentType, Document, Footer, HeadingLevel, Packer, PageNumber, Paragraph,
  StyleLevel, Table, TableCell, TableOfContents, TableRow, TextRun, WidthType,
} from 'docx';
import { dataMarker, usableReferences } from '../shared/project.mjs';
import { appendices, frontSections, manuscriptSectionText, sectionTitle } from '../shared/manuscript.mjs';
import { languageInfo, wordLabels } from '../shared/language.mjs';

const plain = value => value.trim().replace(/^#{1,6}\s+/, '').replace(/\*\*/g, '');

function markdownCells(line) {
  return line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(cell => plain(cell.replace(/\\\|/g, '|')));
}

function table(rows, paragraph, rtl) {
  const width = Math.max(...rows.map(row => row.length));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    visuallyRightToLeft: rtl,
    rows: rows.map((row, index) => new TableRow({
      tableHeader: index === 0,
      cantSplit: true,
      children: Array.from({ length: width }, (_, col) => new TableCell({
        ...(index === 0 ? { shading: { fill: 'E6ECF6' } } : {}),
        margins: { top: 100, bottom: 100, left: 110, right: 110 },
        children: [paragraph(row[col] || '', { spacing: { after: 0 } })],
      })),
    })),
  });
}

function toBlocks(value, paragraph, rtl, itemHeader) {
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
      blocks.push(table(rows, paragraph, rtl));
      hasTable = true;
    } else if (/^#{1,6}\s/.test(line)) {
      blocks.push(paragraph(plain(line), { heading: HeadingLevel.HEADING_2 }));
    } else {
      blocks.push(paragraph(plain(line), { alignment: AlignmentType.JUSTIFIED }));
    }
  }
  if (itemHeader && !hasTable) {
    const items = lines.map(plain).filter(Boolean);
    return [table([itemHeader, ...items.map((line, index) => [String(index + 1), line])], paragraph, rtl)];
  }
  return blocks;
}

export function buildWord(project, kind) {
  const { code, base, rtl, cjk } = languageInfo(project.outputLanguage);
  const labels = wordLabels(project.outputLanguage);
  const label = index => project.documentLabels?.[index]?.trim() || labels?.[index] || '';
  const paragraph = (text, options = {}) => new Paragraph({
    text, bidirectional: rtl, spacing: { after: 120, line: 340 }, ...options,
  });
  const heading = (text, pageBreakBefore = false) =>
    paragraph(text, { heading: HeadingLevel.HEADING_1, pageBreakBefore });
  const title = project.title.trim() || (kind === 'instrument' ? label(6) : '') || (base === 'id' ? 'Karya Ilmiah' : 'RisetAI');
  const titleFor = section => sectionTitle(section, project.outputLanguage);
  const draftName = index => label(index) || String(index + 1);
  const bibliographyTitle = label(7) || 'Daftar Pustaka';
  const filledAppendices = appendices.filter(section => manuscriptSectionText(project, section.id).trim());
  const appendixTitle = section => {
    const index = filledAppendices.indexOf(section) + 1;
    const prefix = base === 'en' ? 'Appendix' : base === 'ar' ? 'الملحق' : 'Lampiran';
    return prefix + ' ' + index + ' – ' + titleFor(section);
  };
  const children = [];
  const full = kind === 'chapters';
  const chapterIndex = /^chapter-[0-4]$/.test(kind) ? Number(kind.slice(-1)) : -1;
  const chapterBlocks = (index, newPage) => {
    const content = project.chapters[index].content.trim() || (index === 3 ? dataMarker : '');
    children.push(heading(draftName(index), newPage));
    if (index === 0 && project.questions.trim()) {
      if (label(5)) children.push(paragraph(label(5), { heading: HeadingLevel.HEADING_2 }));
      children.push(...toBlocks(project.questions, paragraph, rtl));
    }
    children.push(...toBlocks(content, paragraph, rtl));
  };
  const addSection = (section, pageBreakBefore) => {
    const title = titleFor(section);
    const text = manuscriptSectionText(project, section.id);
    const list = section.id === 'contents' || section.id === 'appendixList';
    children.push(list
      ? paragraph(title, { style: 'ManuscriptIndexTitle', pageBreakBefore })
      : heading(title, pageBreakBefore));
    if (section.id === 'contents') {
      if (full) {
        children.push(new TableOfContents(title, {
          headingStyleRange: '1-2', hyperlink: true,
          stylesWithLevels: [new StyleLevel('Appendix Entry', 1)],
        }));
      } else {
        const indexEntries = [
          ...frontSections.filter(item => item.id !== 'contents' &&
            (item.id === 'appendixList' ? filledAppendices.length : manuscriptSectionText(project, item.id).trim())).map(titleFor),
          ...project.chapters.map((_, index) => draftName(index)),
          bibliographyTitle, ...filledAppendices.map(appendixTitle),
        ].filter(Boolean);
        children.push(...indexEntries.map(entry => paragraph(entry)));
      }
    } else if (section.id === 'appendixList') {
      if (full) {
        children.push(new TableOfContents(title, {
          hyperlink: true, stylesWithLevels: [new StyleLevel('Appendix Entry', 1)],
        }));
      } else {
        children.push(...filledAppendices.map(item => paragraph(appendixTitle(item))));
      }
    } else {
      children.push(...toBlocks(text, paragraph, rtl));
    }
  };

  if (full) {
    children.push(paragraph(title, { heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }));
    for (const section of frontSections) {
      const include = section.id === 'contents' || (section.id === 'appendixList'
        ? filledAppendices.length : manuscriptSectionText(project, section.id).trim());
      if (include) addSection(section, true);
    }
    project.chapters.forEach((_, index) => chapterBlocks(index, true));
  } else if (chapterIndex >= 0) {
    chapterBlocks(chapterIndex, false);
  } else if (kind === 'instrument') {
    children.push(paragraph(title, { heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }));
    if (label(6) && title !== label(6)) children.push(heading(label(6)));
    children.push(...toBlocks(project.instrument, paragraph, rtl, [base === 'id' ? 'No.' : '#', label(8)]));
  } else if (kind.startsWith('section-')) {
    const section = frontSections.find(item => item.id === kind.slice(8));
    if (!section) throw new Error('Bagian naskah tidak ditemukan.');
    addSection(section, false);
  }

  if (full || kind === 'bibliography') {
    children.push(heading(bibliographyTitle, full));
    const numbered = ['IEEE', 'Vancouver', 'AMA'].includes(project.citationStyle);
    const refs = usableReferences(project.refs).slice();
    if (!numbered) refs.sort((a, b) => (a.authors || a.title).localeCompare(b.authors || b.title, code));
    refs.forEach((ref, index) => {
      const source = [ref.authors, ref.year && '(' + ref.year + ')', ref.title, ref.publisher]
        .filter(Boolean).map(value => value.replace(/\.$/, '') + '.').join(' ');
      children.push(paragraph((numbered ? '[' + (index + 1) + '] ' : '') + source + (ref.url ? ' ' + ref.url : ''), {
        indent: { [rtl ? 'right' : 'left']: 426, hanging: 426 },
      }));
    });
  }
  const append = (section, pageBreakBefore) => {
    const text = manuscriptSectionText(project, section.id);
    children.push(paragraph(appendixTitle(section), { style: 'ManuscriptAppendixEntry', pageBreakBefore }));
    children.push(...toBlocks(text, paragraph, rtl, section.id === 'instrument' ? [base === 'id' ? 'No.' : '#', label(8)] : undefined));
  };
  if (full || kind === 'appendices') {
    filledAppendices.forEach((section, index) => append(section, full || index > 0));
  } else if (kind.startsWith('appendix-')) {
    const section = filledAppendices.find(item => item.id === kind.slice(9));
    if (!section) throw new Error('Isi lampiran belum tersedia.');
    append(section, false);
  }

  const document = new Document({
    styles: { default: { document: { run: {
      font: { ascii: 'Times New Roman', hAnsi: 'Times New Roman', eastAsia: cjk ? 'Arial Unicode MS' : 'Times New Roman', cs: 'Arial' },
      size: 24,
      language: code ? { value: code, eastAsia: cjk ? code : undefined, bidirectional: rtl ? code : undefined } : undefined,
    } } }, paragraphStyles: [
      { id: 'ManuscriptIndexTitle', name: 'Manuscript Index Title', basedOn: 'Normal',
        run: { bold: true, size: 30 }, paragraph: { keepNext: true, spacing: { after: 240 } } },
      { id: 'ManuscriptAppendixEntry', name: 'Appendix Entry', basedOn: 'Normal',
        run: { bold: true, size: 28 }, paragraph: { keepNext: true, spacing: { after: 240 } } },
    ] },
    features: { updateFields: full },
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1701, bottom: 1701, left: 2268, right: 1701 } } }, footers: { default: new Footer({
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT] })] })],
    }) }, children }],
  });
  const safeTitle = title.replace(/[^\p{L}\p{M}\p{N}\-_ ]/gu, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'risetai';
  const chapterFileNames = ['BAB-I', 'BAB-II', 'BAB-III', 'BAB-IV', 'BAB-V'];
  const sectionId = kind.replace(/^(section|appendix)-/, '');
  const exportSection = [...frontSections, ...appendices].find(section => section.id === sectionId);
  const fileLabels = { instrument: 'instrumen', bibliography: 'daftar-pustaka', appendices: 'lampiran' };
  const exportLabel = chapterFileNames[chapterIndex] || fileLabels[kind] ||
    exportSection?.title.toLowerCase().replace(/ +/g, '-') || kind;
  const suffix = full ? '' : '-' + exportLabel;
  return { document, fileName: safeTitle + suffix + '.docx' };
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

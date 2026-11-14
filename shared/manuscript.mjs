import { analyzeScores, parseScores } from './quant.mjs';
import { languageInfo } from './language.mjs';

export const frontSections = [
  { id: 'approval', title: 'Lembar Persetujuan Ujian', en: 'Examination Approval', ar: 'الموافقة على المناقشة' },
  { id: 'ratification', title: 'Lembar Pengesahan', en: 'Ratification', ar: 'صفحة الاعتماد' },
  { id: 'originality', title: 'Lembar Pernyataan Keaslian Penelitian', en: 'Declaration of Originality', ar: 'إقرار الأصالة' },
  { id: 'abstract', title: 'Abstrak', en: 'Abstract', ar: 'الملخص' },
  { id: 'preface', title: 'Kata Pengantar', en: 'Preface', ar: 'التقديم' },
  { id: 'contents', title: 'Daftar Isi', en: 'Table of Contents', ar: 'جدول المحتويات' },
  { id: 'figures', title: 'Daftar Gambar', en: 'List of Figures', ar: 'قائمة الأشكال' },
  { id: 'tables', title: 'Daftar Tabel', en: 'List of Tables', ar: 'قائمة الجداول' },
  { id: 'appendixList', title: 'Daftar Lampiran', en: 'List of Appendices', ar: 'قائمة الملاحق' },
];

export const appendices = [
  { id: 'instrument', title: 'Instrumen Penelitian', en: 'Research Instrument', ar: 'أداة البحث' },
  { id: 'scores', title: 'Data Skor Responden', en: 'Respondent Score Data', ar: 'درجات المشاركين' },
  { id: 'findings', title: 'Hasil Penelitian', en: 'Research Findings', ar: 'نتائج البحث' },
  { id: 'validity', title: 'Rekapitulasi Hasil Pengujian Validitas Instrumen', en: 'Instrument Validity Test Summary', ar: 'ملخص اختبار صدق الأداة' },
  { id: 'descriptive', title: 'Deskripsi Data Skor', en: 'Descriptive Score Statistics', ar: 'الإحصاءات الوصفية للدرجات' },
  { id: 'recap', title: 'Rekapitulasi Data Penelitian', en: 'Research Data Summary', ar: 'ملخص بيانات البحث' },
  { id: 'calculations', title: 'Hasil Perhitungan dan Analisis', en: 'Calculations and Analysis Results', ar: 'نتائج الحسابات والتحليل' },
];

export const editableSections = [
  ...frontSections.filter(section => !['contents', 'appendixList'].includes(section.id)),
  ...appendices.filter(section => section.id !== 'instrument'),
];

export function sectionTitle(section, language) {
  const { base } = languageInfo(language);
  return base === 'en' ? section.en : base === 'ar' ? section.ar : section.title;
}

const templates = {
  approval: 'Judul penelitian\n{judul}\n\nNama peneliti: [Nama]\nNomor induk: [Nomor induk]\nProgram/kelas: [Program atau kelas]\n\nPersetujuan untuk diajukan pada ujian penelitian.\n\n[Tempat], [Tanggal]\nPembimbing: [Nama dan tanda tangan]',
  ratification: 'Judul penelitian\n{judul}\n\nNama peneliti: [Nama]\nNomor induk: [Nomor induk]\n\nTelah diuji pada: [Hari, tanggal]\nKetua penguji: [Nama dan tanda tangan]\nPenguji: [Nama dan tanda tangan]\nPembimbing: [Nama dan tanda tangan]\nPengesahan lembaga: [Jabatan, nama, dan tanda tangan]',
  originality: 'Saya yang bertanda tangan di bawah ini:\nNama: [Nama]\nNomor induk: [Nomor induk]\n\nSaya menyatakan bahwa penelitian berjudul “{judul}” merupakan karya saya. Semua sumber yang digunakan telah dicantumkan sesuai ketentuan.\n\n[Tempat], [Tanggal]\n[Nama dan tanda tangan peneliti]',
  abstract: '[Latar belakang singkat, tujuan, metode, temuan yang didukung data, dan kesimpulan.]\n\nKata kunci: [3–5 kata kunci]',
  preface: '[Tuliskan maksud penyusunan, ucapan terima kasih, dan penutup.]\n\n[Tempat], [Tanggal]\n[Nama peneliti]',
  figures: 'Gambar [nomor]. [Judul gambar]',
  tables: 'Tabel [nomor]. [Judul tabel]',
  findings: '[Ringkas temuan yang telah diperiksa dan sebutkan sumber datanya.]',
  validity: '| Butir | Metode | Statistik | Kriteria | Keputusan |\n| --- | --- | --- | --- | --- |\n| [Kode butir] | [Metode] | [Nilai] | [Kriteria] | [Keputusan] |',
  recap: '| Variabel atau indikator | Jumlah data | Ringkasan |\n| --- | --- | --- |\n| [Nama] | [n] | [Ringkasan] |',
};

export function manuscriptTemplate(id, title) {
  return (templates[id] || '').replace('{judul}', () => title.trim() || '[Judul penelitian]');
}

function scoreTable(scores) {
  const { headers, rows } = parseScores(scores);
  const formatRow = cells => '| ' + cells.map(value => String(value).replace(/\|/g, '\\|')).join(' | ') + ' |';
  // Split wide questionnaires so columns fit the Word page. Respondent codes repeat in every block.
  const tables = [];
  for (let column = 0; column < headers.length; column += 6) {
    const subset = headers.slice(column, column + 6);
    tables.push([
      formatRow(['#', ...subset]),
      formatRow(Array(subset.length + 1).fill('---')),
      ...rows.map((row, index) => formatRow([index + 1, ...row.slice(column, column + subset.length)])),
    ].join('\n'));
  }
  return tables.join('\n\n');
}

export function manuscriptSectionText(project, id) {
  return id === 'instrument' ? project.instrument : project.manuscript?.[id] || '';
}

export function manuscriptImport(project, id) {
  const { quantitative } = project;
  switch (id) {
    case 'scores':
      return quantitative.scores.trim() ? scoreTable(quantitative.scores) : '';
    case 'descriptive':
      return quantitative.scores.trim() ? analyzeScores(quantitative.scores, 'descriptive', 0, 1, 0.05) : '';
    case 'calculations':
      return [quantitative.result, quantitative.external].filter(value => value.trim()).join('\n\n');
    default:
      return '';
  }
}

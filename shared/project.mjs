import { editableSections } from './manuscript.mjs';
import { defaultLanguage, normalizeLanguage } from './language.mjs';

export const dataMarker = '[MASUKKAN DATA PENELITIAN]';

export const chapterHeadings = [
  ['BAB I', 'PENDAHULUAN'],
  ['BAB II', 'TINJAUAN PUSTAKA'],
  ['BAB III', 'METODE PENELITIAN'],
  ['BAB IV', 'HASIL PENELITIAN DAN PEMBAHASAN'],
  ['BAB V', 'PENUTUP'],
];

export const referenceTypes = ['Jurnal', 'Buku', 'Artikel', 'Website', 'Lainnya'];
const quantDefaults = { scores: '', external: '', result: '', method: 'descriptive', first: 0, second: 1, threshold: 0.05 };

export const emptyProject = {
  title: '',
  field: '',
  method: '',
  researchType: 'Kuantitatif',
  citationStyle: 'APA 7',
  outputLanguage: defaultLanguage,
  documentLabels: Array(9).fill(''),
  instructions: '',
  questions: '',
  refs: [],
  chapters: chapterHeadings.map(([chapter, heading], index) => ({
    chapter, heading, content: index === 3 ? dataMarker : '',
  })),
  instrumentType: 'Kuesioner',
  respondent: '',
  objective: '',
  scale: 'Skala Likert 1–5',
  instrument: '',
  pageTargets: [10, 25, 15, 20, 10],
  wordTargets: [0, 0, 0, 0, 0],
  quantitative: quantDefaults,
  manuscript: {},
};

const string = value => typeof value === 'string' ? value : '';

export function usableReferences(refs) {
  return Array.isArray(refs) ? refs.filter(ref => ref && (ref.source === 'Manual' || ref.verified === true)) : [];
}

export function safeSourceUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

export function normalizeProject(value) {
  const input = value && typeof value === 'object' ? value : {};
  const project = { ...emptyProject };
  for (const key of ['title', 'field', 'method', 'researchType', 'citationStyle', 'instrumentType', 'respondent', 'scale']) {
    if (typeof input[key] === 'string') project[key] = string(input[key]);
  }
  for (const key of ['instructions', 'questions', 'objective', 'instrument']) {
    project[key] = string(input[key]);
  }
  project.outputLanguage = normalizeLanguage(input.outputLanguage);
  project.documentLabels = Array.from({ length: 9 }, (_, index) => string(input.documentLabels?.[index]).trim().slice(0, 160));
  project.chapters = emptyProject.chapters.map((chapter, index) => ({
    ...chapter,
    content: typeof input.chapters?.[index]?.content === 'string'
      ? string(input.chapters[index].content)
      : chapter.content,
    model: string(input.chapters?.[index]?.model),
  }));
  project.refs = Array.isArray(input.refs) ? input.refs.filter(ref => ref && typeof ref === 'object').map((ref, index) => ({
    id: string(ref.id) || String(index),
    title: string(ref.title),
    authors: string(ref.authors),
    year: string(ref.year),
    publisher: string(ref.publisher),
    url: string(ref.url),
    snippet: string(ref.snippet),
    source: string(ref.source),
    kind: referenceTypes.includes(ref.kind) ? ref.kind : '',
    verified: ref.verified === true,
  })) : [];
  project.pageTargets = emptyProject.pageTargets.map((fallback, index) =>
    Math.min(100, Math.max(1, Math.round(Number(input.pageTargets?.[index])) || fallback)));
  project.wordTargets = emptyProject.wordTargets.map((_, index) =>
    Math.min(50_000, Math.max(0, Math.round(Number(input.wordTargets?.[index])) || 0)));
  const quant = input.quantitative || {};
  project.quantitative = {
    scores: string(quant.scores),
    external: string(quant.external),
    result: string(quant.result),
    method: ['descriptive', 'pearson', 'paired', 'alpha'].includes(quant.method) ? quant.method : quantDefaults.method,
    first: Number.isInteger(quant.first) ? quant.first : quantDefaults.first,
    second: Number.isInteger(quant.second) ? quant.second : quantDefaults.second,
    threshold: [0.01, 0.05, 0.1].includes(quant.threshold) ? quant.threshold : quantDefaults.threshold,
  };
  project.manuscript = Object.fromEntries(editableSections.flatMap(({ id }) => {
    const content = string(input.manuscript?.[id]);
    return content.trim() ? [[id, content]] : [];
  }));
  return project;
}

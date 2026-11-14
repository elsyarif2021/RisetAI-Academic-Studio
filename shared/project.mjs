export const dataMarker = '[MASUKKAN DATA PENELITIAN]';

export const chapterHeadings = [
  ['BAB I', 'PENDAHULUAN'],
  ['BAB II', 'TINJAUAN PUSTAKA'],
  ['BAB III', 'METODE PENELITIAN'],
  ['BAB IV', 'HASIL PENELITIAN DAN PEMBAHASAN'],
  ['BAB V', 'PENUTUP'],
];

export const emptyProject = {
  title: '',
  field: '',
  method: '',
  researchType: 'Kuantitatif',
  citationStyle: 'APA 7',
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
    verified: ref.verified === true,
  })) : [];
  project.pageTargets = emptyProject.pageTargets.map((fallback, index) =>
    Math.min(100, Math.max(1, Math.round(Number(input.pageTargets?.[index])) || fallback)));
  return project;
}

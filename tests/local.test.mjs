import { analyzeScores, parseScores } from '../shared/quant.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { Packer } from 'docx';
import { spawnSync } from 'node:child_process';
import { projectActions } from '../backend/projects.mjs';
import { researchActions } from '../backend/research.mjs';
import { dataMarker, normalizeProject } from '../shared/project.mjs';
import { buildWord } from '../src/word.mjs';
import { manuscriptImport } from '../shared/manuscript.mjs';
import { countResearchWords, languageInfo, wordLabels } from '../shared/language.mjs';

function memoryDatabase() {
  const tables = new Map();
  const getTable = name => {
    if (!tables.has(name)) tables.set(name, new Map());
    return tables.get(name);
  };
  const tx = {
    async add(name, records) {
      const table = getTable(name);
      return records.map(({ id, ...value }) => {
        if (table.has(id)) return null;
        table.set(id, value);
        return id;
      });
    },
    update: (name, rows, options) => ({ name, rows, options }),
  };
  return {
    tx,
    async list(name) {
      return { items: [...getTable(name)].map(([id, data]) => ({ id, ...data })) };
    },
    async get(name, ids) {
      return ids.map(id => structuredClone(getTable(name).get(id) ?? null));
    },
    async transact(operations) {
      for (const { name, rows } of operations) {
        for (const { id, if: condition } of rows) {
          const current = getTable(name).get(id);
          if (condition && Object.entries(condition).some(([key, expected]) => current?.[key] !== expected)) {
            throw Object.assign(new Error('Conflict'), { code: 'AppDatabaseConditionFailed' });
          }
        }
      }
      for (const { name, rows, options } of operations) {
        for (const { id, record } of rows) {
          const table = getTable(name);
          table.set(id, structuredClone(options?.patch ? { ...table.get(id), ...record } : record));
        }
      }
    },
  };
}

test('proyek tersedia untuk pemiliknya, dengan simpan idempoten dan perlindungan versi', async () => {
  const routes = projectActions(memoryDatabase(), error => !!error?.code);
  const id = crypto.randomUUID();
  const holder = { userId: 'owner', params: { id }, query: {} };
  const neighbor = { ...holder, userId: 'other' };
  assert.equal((await routes.create({ ...holder, body: { id } })).status, 201);
  assert.equal((await routes.create({ ...holder, body: { id } })).status, 200);
  assert.equal((await routes.read(holder)).data.project.chapters[3].content, dataMarker);
  const project = normalizeProject({ title: 'Studi siswa' });
  project.chapters[0].content = 'Catatan observasi';
  project.instrument = 'Pertanyaan pertama';
  project.refs.push({ title: 'Metode Penelitian', source: 'Manual', kind: 'Buku' });
  project.wordTargets[0] = 3200;
  project.outputLanguage = 'ar';
  project.manuscript.abstract = 'Abstrak yang disimpan.';
  project.quantitative.external = 'Laporan t = 2,38';
  const firstSave = { ...holder, body: { revision: 0, saveId: crypto.randomUUID(), project } };
  assert.equal((await routes.save(firstSave)).status, 200);
  assert.equal((await routes.save(firstSave)).data.revision, 1);
  assert.equal((await routes.save({ ...firstSave, body: { ...firstSave.body, saveId: crypto.randomUUID() } })).status, 409);
  assert.equal((await routes.list(holder)).data.items[0].title, 'Studi siswa');
  assert.equal((await routes.list(neighbor)).data.items.length, 0);
  assert.equal((await routes.read(neighbor)).status, 404);
  assert.equal((await routes.save({ ...firstSave, userId: 'other' })).status, 404);
  const reopened = (await routes.read(holder)).data.project;
  assert.equal(reopened.chapters[0].content, 'Catatan observasi');
  assert.equal(reopened.instrument, 'Pertanyaan pertama');
  assert.equal(reopened.refs[0].title, 'Metode Penelitian');
  assert.equal(reopened.refs[0].kind, 'Buku');
  assert.equal(reopened.wordTargets[0], 3200);
  assert.equal(reopened.outputLanguage, 'ar');
  assert.deepEqual(reopened.manuscript, { abstract: 'Abstrak yang disimpan.' });
  assert.equal(normalizeProject({ title: 'Proyek lama' }).outputLanguage, 'id');
  assert.equal(reopened.quantitative.external, 'Laporan t = 2,38');
});

test('DOCX mencantumkan kelima bab, penanda data, tabel instrumen dan referensi yang memenuhi syarat', async () => {
  const project = normalizeProject({
    title: 'Studi siswa',
    questions: 'Bagaimana kebiasaan belajar siswa?',
    instrument: '| No. | Pernyataan |\n| --- | --- |\n| 1 | Saya membaca buku. |',
    refs: [
      { title: 'Metode Penelitian', source: 'Manual' },
      { title: 'Temuan pemeriksaan', source: 'Google Scholar', verified: true },
      { title: 'Belum diperiksa', source: 'Google Scholar' },
    ],
  });
  const { document, fileName } = buildWord(project, 'chapters');
  assert.equal(fileName, 'Studi-siswa.docx');
  const exported = await Packer.toBuffer(document);
  assert.equal(exported.subarray(0, 2).toString(), 'PK');
  const unpack = spawnSync('python3', [
    '-c', 'import io,sys,zipfile; print(zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())).read("word/document.xml").decode())',
  ], { input: exported, encoding: 'utf8' });
  assert.equal(unpack.status, 0, unpack.stderr);
  const xml = unpack.stdout;
  for (const term of ['BAB I –', 'BAB II –', 'BAB III –', 'BAB IV –', 'BAB V –', dataMarker, '<w:tbl>', 'DAFTAR PUSTAKA', 'Metode Penelitian', 'Temuan pemeriksaan', 'Pertanyaan Penelitian']) assert.ok(xml.includes(term), term);
  assert.ok(!xml.includes('Belum diperiksa'));
});

test('Ollama menampilkan masalah konfigurasi dan tidak menyertakan referensi eksternal yang belum diperiksa', async context => {
  const config = { ollamaKey: '', googleKey: '', googleCse: '', serpKey: '' };
  const absent = await researchActions.questions({ title: 'Belajar' }, config);
  assert.equal(absent.status, 503);
  assert.match(absent.data.error, /OLLAMA_API_KEY/);
  const noRefs = await researchActions.generate({ title: 'Belajar', chapterIndex: 3, references: [{ title: 'Judul luar', source: 'Google' }] }, config);
  assert.equal(noRefs.status, 400);
  context.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://ollama.com/api/chat');
    const request = JSON.parse(options.body);
    assert.equal(request.model, 'deepseek-v4.1-flash');
    assert.equal(request.stream, false);
    assert.equal(request.think, false);
    assert.doesNotMatch(options.body, /Judul luar/);
    return Response.json({ message: { content: 'Susunan tabel data.' } });
  });
  const chapter = await researchActions.generate({
    title: 'Belajar', chapterIndex: 3, references: [{ title: 'Judul luar', source: 'Google' }, { title: 'Buku Metode', source: 'Manual' }],
  }, { ...config, ollamaKey: 'test-only' });
  assert.equal(chapter.status, 200);
  assert.ok(chapter.data.chapter.content.startsWith(dataMarker));
});


test('Ollama mencoba model cadangan saat model utama tidak tersedia', async context => {
  const tried = [];
  context.mock.method(globalThis, 'fetch', async (_url, options) => {
    const request = JSON.parse(options.body);
    tried.push(request.model);
    assert.equal(request.options.num_predict, 16);
    return tried.length === 1
      ? Response.json({ error: 'model not found' }, { status: 404 })
      : Response.json({ message: { content: 'OK' } });
  });
  const result = await researchActions['ai-check']({}, { ollamaKey: 'test-only' });
  assert.equal(result.status, 200);
  assert.equal(result.data.model, 'gemma4:31b');
  assert.deepEqual(tried, ['deepseek-v4.1-flash', 'gemma4:31b']);
});


test('rumus kuantitatif menghitung skor dan menolak data yang tidak lengkap', () => {
  assert.deepEqual(parseScores('X;Y\n1,5;2\n3;4').rows, [[1.5, 2], [3, 4]]);
  assert.match(analyzeScores('X;Y\n1;2\n2;4\n3;6', 'pearson', 0, 1, 0.05), /r Pearson: 1/);
  assert.match(analyzeScores('X;Y\n2;1\n4;2\n6;3', 'paired', 0, 1, 0.05), /p dua sisi = 0,0742/);
  assert.match(analyzeScores('X;Y\n1;1\n2;2\n3;3', 'alpha', 0, 1, 0.05), /Alpha Cronbach: 1/);
  assert.match(analyzeScores('X\n1\n2\n3', 'descriptive', 0, 1, 0.05), /X \| 2 \| 1/);
  assert.throws(() => parseScores('X;Y\n1;\n2;4'), /Baris data 1/);
});

test('lanjutan BAB IV memakai draf lama dan hasil yang diberikan', async context => {
  context.mock.method(globalThis, 'fetch', async (_url, options) => {
    const payload = JSON.parse(options.body);
    const prompt = payload.messages.at(-1).content;
    assert.match(prompt, /Lanjutkan bab/);
    assert.match(prompt, /Bagian awal yang sudah dibuat/);
    assert.match(prompt, /r = 0,55/);
    assert.match(prompt, /4 halaman atau 1200 kata/);
    assert.ok(payload.options.num_predict < 1400);
    return Response.json({ message: { content: 'Pembahasan hasil.' } });
  });
  const result = await researchActions.generate({
    title: 'Studi siswa', chapterIndex: 3, references: [{ title: 'Metode', source: 'Manual', kind: 'Buku' }],
    targetWords: 1200, chunkWords: 150, pageTargets: [{}, {}, {}, { pages: 4 }],
    existingText: 'Bagian awal yang sudah dibuat', mode: 'extend', quantitativeEvidence: 'r = 0,55',
  }, { ollamaKey: 'test-only' });
  assert.equal(result.status, 200);
  assert.equal(result.data.chapter.content, 'Pembahasan hasil.');
});

test('empat generator menerima bahasa penelitian, termasuk bahasa yang diketik sendiri', async context => {
  const targets = ['English (en)', 'Arabic (ar)', 'Bahasa Sunda', 'Simplified Chinese (zh-Hans)'];
  const outputs = [
    JSON.stringify(['One', 'Two', 'Three', 'Four', 'Five']),
    'ما سؤال البحث؟',
    'Ieu bubuka.',
    '| 编号 | 问题 |\n| --- | --- |\n| 1 | 请回答。 |',
  ];
  let index = 0;
  context.mock.method(globalThis, 'fetch', async (_url, options) => {
    const { messages } = JSON.parse(options.body);
    assert.ok(messages[0].content.includes(JSON.stringify(targets[index])), messages[0].content);
    assert.doesNotMatch(messages.at(-1).content, /dalam bahasa Indonesia/);
    return Response.json({ message: { content: outputs[index++] } });
  });
  const config = { ollamaKey: 'test-only' };
  assert.equal((await researchActions['suggest-titles']({ keywords: 'Study', outputLanguage: 'en' }, config)).data.titles.length, 5);
  assert.equal((await researchActions.questions({ title: 'بحث', outputLanguage: 'ar' }, config)).data.questions, outputs[1]);
  assert.equal((await researchActions.generate({
    title: 'Panalungtikan', chapterIndex: 0, outputLanguage: 'Bahasa Sunda',
    references: [{ title: 'Metode', source: 'Manual' }],
  }, config)).data.chapter.content, outputs[2]);
  assert.equal((await researchActions.instrument({ title: '学习', objective: '研究', outputLanguage: 'zh-Hans' }, config)).data.instrument, outputs[3]);
});

test('Word berbahasa Arab memakai arah RTL dan menyimpan judul sumber asli', async () => {
  const project = normalizeProject({
    title: 'بحث التعليم', outputLanguage: 'ar', questions: 'ما سؤال البحث؟',
    instrument: 'أقرأ كل يوم.', refs: [{ title: 'Metode Penelitian', source: 'Manual' }],
  });
  const file = await Packer.toBuffer(buildWord(project, 'chapters').document);
  const unpack = spawnSync('python3', [
    '-c', 'import io,sys,zipfile; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); print(z.read("word/document.xml").decode()); print(z.read("word/styles.xml").decode())',
  ], { input: file, encoding: 'utf8' });
  assert.equal(unpack.status, 0, unpack.stderr);
  for (const term of ['الفصل الأول – المقدمة', 'أسئلة البحث', 'المراجع', 'Metode Penelitian', '<w:bidi', '<w:bidiVisual', 'w:bidi="ar"']) {
    assert.ok(unpack.stdout.includes(term), term);
  }
  assert.ok(!unpack.stdout.includes('DAFTAR PUSTAKA'));
  assert.ok(countResearchWords('这是研究方法。' + dataMarker, 'zh-Hans') > 1);
  assert.equal(countResearchWords(dataMarker, 'en'), 0);
  assert.equal(languageInfo('ar-EG').rtl, true);
  assert.ok(wordLabels('zh-TW')[0].includes('緒論'));
});

test('ekspor satu bab, bagian awal, daftar pustaka, dan lampiran memisahkan isi dengan benar', async () => {
  const project = normalizeProject({
    title: 'Penelitian Kelas', questions: 'Apa topik penelitian?',
    instrument: 'Butir instrumen asli.',
    refs: [{ title: 'Buku rujukan', source: 'Manual' }],
    chapters: [{ content: 'Isi pendahuluan.' }, { content: 'Kajian sumber.' }],
    manuscript: {
      abstract: 'Uraian abstrak.', approval: 'Persetujuan pembimbing.',
      validity: '| Butir | Nilai |\n| --- | --- |\n| B1 | 0,76 |',
    },
    quantitative: { scores: 'A;B;C;D;E;F;G\n1;2;3;4;5;6;7\n2;3;4;5;6;7;8' },
  });
  project.manuscript.scores = manuscriptImport(project, 'scores');
  project.manuscript.descriptive = manuscriptImport(project, 'descriptive');
  assert.match(project.manuscript.scores, /\| # \| G \|\n\| --- \| --- \|/);
  assert.match(project.manuscript.descriptive, /Rata-rata/);

  async function xml(kind) {
    const built = buildWord(project, kind);
    const buffer = await Packer.toBuffer(built.document);
    const result = spawnSync('python3', [
      '-c', 'import io,sys,zipfile; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); print(z.read("word/document.xml").decode()); print(z.read("word/settings.xml").decode())',
    ], { input: buffer, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return { text: result.stdout, name: built.fileName };
  }

  const chapter = await xml('chapter-1');
  assert.equal(chapter.name, 'Penelitian-Kelas-BAB-II.docx');
  assert.match(chapter.text, /BAB II – TINJAUAN PUSTAKA/);
  assert.match(chapter.text, /Kajian sumber/);
  assert.doesNotMatch(chapter.text, /BAB I –|Uraian abstrak|Buku rujukan|Butir instrumen asli/);
  const front = await xml('section-abstract');
  assert.match(front.text, /Uraian abstrak/);
  assert.doesNotMatch(front.text, /Kajian sumber/);
  const ref = await xml('bibliography');
  assert.match(ref.text, /Buku rujukan/);
  assert.doesNotMatch(ref.text, /Uraian abstrak/);
  const attachment = await xml('appendix-validity');
  assert.match(attachment.text, /0,76/);
  assert.match(attachment.text, /<w:tbl>/);
  assert.doesNotMatch(attachment.text, /Butir instrumen asli/);
  const complete = await xml('chapters');
  for (const term of ['Daftar Isi', 'Daftar Lampiran', 'Appendix Entry', '<w:updateFields', 'Persetujuan pembimbing', 'Uraian abstrak', 'Buku rujukan', '0,76']) {
    assert.ok(complete.text.includes(term), term);
  }
  assert.ok(complete.text.indexOf('Uraian abstrak') < complete.text.indexOf('Kajian sumber'));
  assert.ok(complete.text.indexOf('Buku rujukan') < complete.text.indexOf('0,76'));
});

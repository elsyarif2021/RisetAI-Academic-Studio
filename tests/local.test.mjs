import assert from 'node:assert/strict';
import test from 'node:test';
import { Packer } from 'docx';
import { spawnSync } from 'node:child_process';
import { projectActions } from '../backend/projects.mjs';
import { researchActions } from '../backend/research.mjs';
import { dataMarker, normalizeProject } from '../shared/project.mjs';
import { buildWord } from '../src/word.mjs';

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
  project.refs.push({ title: 'Metode Penelitian', source: 'Manual' });
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
  context.mock.method(globalThis, 'fetch', async (_url, options) => {
    assert.doesNotMatch(options.body, /Judul luar/);
    return Response.json({ choices: [{ message: { content: 'Susunan tabel data.' } }] });
  });
  const chapter = await researchActions.generate({
    title: 'Belajar', chapterIndex: 3, references: [{ title: 'Judul luar', source: 'Google' }, { title: 'Buku Metode', source: 'Manual' }],
  }, { ...config, ollamaKey: 'test-only' });
  assert.equal(chapter.status, 200);
  assert.ok(chapter.data.chapter.content.startsWith(dataMarker));
});

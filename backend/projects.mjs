import { createHash } from 'node:crypto';
import { normalizeProject } from '../shared/project.mjs';

const tableFor = (userId, group) => group + '_' + createHash('sha256').update(userId).digest('hex');
const validId = id => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id);
const partsFor = id => [id + '-details', id + '-instrument', id + '-refs', ...Array.from({length: 5}, (_, i) => id + '-bab-' + i)];

export function projectActions(db, isDatabaseError) {
  const ok = (data, status = 200) => ({ data, status });
  const fail = (error, status) => ok({ error }, status);
  const conflict = () => fail('Proyek sudah diperbarui dari perangkat lain. Salin perubahan Anda sebelum membuka ulang proyek.', 409);
  const handle = action => async context => {
    try {
      return await action(context, tableFor(context.userId, 'projects'), tableFor(context.userId, 'manuscripts'));
    } catch (err) {
      if (!isDatabaseError(err)) throw err;
      if (err.code === 'AppDatabaseQuotaExceeded') return fail('Batas operasi database tercapai. Coba kembali nanti.', 429);
      if (err.code === 'AppDatabaseItemTooLarge') return fail('Salah satu bagian terlalu panjang untuk disimpan.', 413);
      return fail('Penyimpanan belum dapat dikonfirmasi. Periksa koneksi dan coba lagi.', 503);
    }
  };

  return {
    list: handle(async ({ query }, projects) => {
      const page = await db.list(projects, { limit: 30, nextToken: query?.cursor || undefined });
      return ok(page);
    }),
    create: handle(async ({ body }, projects) => {
      const id = body?.id;
      if (!validId(id)) return fail('ID proyek tidak valid.', 400);
      const [existing] = await db.get(projects, [id], { consistent: true });
      if (existing) return ok({ id, ...existing });
      const summary = { title: 'Proyek tanpa judul', updatedAt: new Date().toISOString(), revision: 0 };
      const [created] = await db.tx.add(projects, [{ id, ...summary }]);
      if (!created) {
        const [committed] = await db.get(projects, [id], { consistent: true });
        return committed ? ok({ id, ...committed }) : fail('Pembuatan proyek belum dapat dikonfirmasi. Coba lagi.', 503);
      }
      return ok({ id, ...summary }, 201);
    }),
    read: handle(async ({ params }, projects, manuscripts) => {
      const { id } = params;
      if (!validId(id)) return fail('Proyek tidak ditemukan.', 404);
      for (let attempt = 0; attempt < 2; attempt++) {
        const [summary] = await db.get(projects, [id], { consistent: true });
        if (!summary) return fail('Proyek tidak ditemukan.', 404);
        if (summary.revision === 0) return ok({ id, ...summary, project: normalizeProject(null) });
        const [details, instrument, refs, ...chapters] = await db.get(manuscripts, partsFor(id), { consistent: true });
        if ([details, instrument, refs, ...chapters].every(part => part?.revision === summary.revision)) {
          return ok({ id, ...summary, project: normalizeProject({
            ...details.value, instrument: instrument.value, refs: refs.value, chapters: chapters.map(part => part.value),
          }) });
        }
      }
      return fail('Proyek sedang diperbarui. Buka kembali dalam beberapa saat.', 409);
    }),
    save: handle(async ({ body, params }, projects, manuscripts) => {
      const { id } = params;
      if (!validId(id)) return fail('Proyek tidak ditemukan.', 404);
      if (!body?.project || !Number.isSafeInteger(body.revision) || !validId(body.saveId)) {
        return fail('Data penyimpanan tidak valid.', 400);
      }
      const [current] = await db.get(projects, [id], { consistent: true });
      if (!current) return fail('Proyek tidak ditemukan.', 404);
      if (current.saveId === body.saveId) return ok({ id, ...current });
      if (current.revision !== body.revision) return conflict();

      const { instrument, refs, chapters, ...detail } = normalizeProject(body.project);
      const revision = current.revision + 1;
      if (detail.title.length > 300) return fail('Judul dapat memuat hingga 300 karakter.', 400);
      const values = [detail, instrument, refs, ...chapters];
      const records = partsFor(id).map((partId, index) => ({ id: partId, record: { revision, value: values[index] } }));
      if (Buffer.byteLength(JSON.stringify(records), 'utf8') > 950 * 1024 ||
          records.some(part => Buffer.byteLength(JSON.stringify(part), 'utf8') > 240 * 1024)) {
        return fail('Salah satu bagian terlalu panjang untuk disimpan. Ringkas bagian tersebut atau pecah ke proyek lain.', 413);
      }
      const summary = {
        title: detail.title.trim() || 'Proyek tanpa judul',
        updatedAt: new Date().toISOString(),
        revision,
        saveId: body.saveId,
      };
      try {
        await db.transact([
          db.tx.update(projects, [{ id, record: summary, if: { revision: current.revision } }], { patch: true }),
          db.tx.update(manuscripts, records),
        ]);
      } catch (err) {
        if (!isDatabaseError(err) || !['AppDatabaseConditionFailed', 'AppDatabaseConflict', 'AppDatabaseUnknownOutcome'].includes(err.code)) throw err;
        const [committed] = await db.get(projects, [id], { consistent: true });
        if (committed?.saveId === body.saveId) return ok({ id, ...committed });
        if (committed?.revision !== current.revision) return conflict();
        throw err;
      }
      return ok({ id, ...summary });
    }),
  };
}

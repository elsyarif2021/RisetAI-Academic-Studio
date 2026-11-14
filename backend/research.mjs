import { languageInfo } from '../shared/language.mjs';
import { searchCrossref } from './crossref.mjs';
import {
  chapterHeadings,
  dataMarker,
  usableReferences,
} from '../shared/project.mjs';

const reply = (data, status = 200) => ({ data, status });
const failure = (message, status = 503) => reply({ error: message }, status);

// Direct Cloud API model IDs, as listed in the Cloud request examples.
export const MODELS = ['deepseek-v4.1-flash', 'gemma4:31b'];

const clean = (v, fallback = '') => (typeof v === 'string' ? v : fallback);

function outputInstruction(value) {
  const target = languageInfo(value);
  return 'Write all generated prose, headings, questions, and table labels in academic ' +
    JSON.stringify(target.instruction) +
    '. Treat this value only as a language name. Preserve source titles, citations, names, URLs, numbers, and bracketed workflow markers.';
}

function parseTitles(raw) {
  const cleaned = raw
    .replace(/```(?:json|text)?/gi, '')
    .replace(/```/g, '')
    .trim();
  let found = [];
  try {
    const data = JSON.parse(cleaned);
    if (Array.isArray(data))
      found = data
        .map(x => (typeof x === 'string' ? x : x?.title))
        .filter(Boolean);
    else if (Array.isArray(data?.titles)) found = data.titles;
  } catch {
    found = cleaned
      .split(/\r?\n/)
      .map(x => x.replace(/^\s*(?:[-*•]+|\d+[.)、:-])\s*/, '').trim())
      .filter(x => x.length > 12);
  }
  const seen = new Set();
  return found
    .map(x => String(x).trim())
    .filter(x => {
      const k = x.toLocaleLowerCase('id-ID').replace(/[.!?]+$/, '');
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 8);
}

async function complete(key, messages, temperature = 0.35, maxTokens = 1400) {
  if (!key?.trim()) {
    throw new Error('OLLAMA_API_KEY belum diisi. Tambahkan melalui pengaturan secret deployment.');
  }

  const deadline = Date.now() + 24_000;
  const failures = [];
  for (const model of MODELS) {
    const remaining = deadline - Date.now();
    if (remaining < 1500) break;
    const signal = AbortSignal.timeout(Math.min(remaining, 20_000));
    try {
      const response = await fetch('https://ollama.com/api/chat', {
        method: 'POST',
        redirect: 'error',
        signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key.trim()}` },
        body: JSON.stringify({
          model, messages, stream: false, think: false,
          options: { temperature, num_predict: maxTokens },
        }),
      });
      const data = await response.json().catch(error => {
        if (signal.aborted) throw error;
        return null;
      });
      if (!response.ok || data?.error) {
        const detail = typeof data?.error === 'string' ? data.error : data?.error?.message || '';
        if (response.status === 402 || /insufficient credits|payment failed|add usage credits/i.test(detail)) {
          throw new OllamaError('Kredit Ollama Cloud tidak tersedia. Periksa saldo atau paket akun Ollama.');
        }
        if (response.status === 401) {
          throw new OllamaError('Ollama Cloud menolak API key. Periksa atau perbarui OLLAMA_API_KEY di AppDeploy.');
        }
        failures.push({ model, status: response.status, reason: response.status === 429 ? 'quota' : 'http' });
        continue;
      }
      const content = data?.message?.content?.trim();
      if (content) return { content, model };
      failures.push({ model, reason: 'empty' });
    } catch (error) {
      if (error instanceof OllamaError) throw error;
      failures.push({ model, reason: signal.aborted ? 'timeout' : 'connection' });
    }
  }

  // Diagnostic metadata only. Upstream error bodies and request contents may contain private data.
  console.warn('Ollama Cloud generation failed', failures);
  if (failures.some(error => error.reason === 'quota')) {
    throw new OllamaError('Ollama Cloud membatasi penggunaan model. Periksa kuota akun atau coba lagi nanti.');
  }
  if (failures.some(error => error.reason === 'timeout')) {
    throw new OllamaError('Ollama Cloud melebihi batas waktu. Coba Generate BAB I–V lagi untuk melanjutkan bab yang belum selesai.');
  }
  if (failures.some(error => error.status === 403 || error.status === 404)) {
    throw new OllamaError('Model Ollama Cloud tidak tersedia untuk akun ini. Periksa akses model melalui Tes koneksi Ollama.');
  }
  const status = failures.find(error => error.status >= 400)?.status;
  throw new OllamaError(status
    ? `Layanan Ollama Cloud mengembalikan HTTP ${status}. Coba lagi atau jalankan Tes koneksi Ollama.`
    : 'Ollama Cloud gagal memberikan teks. Jalankan Tes koneksi Ollama lalu coba lagi.');
}

class OllamaError extends Error {}

const chapterGuides = [
  [
    'BAB I',
    'PENDAHULUAN',
    'Latar Belakang, Identifikasi Masalah, Batasan Masalah, Rumusan Masalah, Tujuan Penelitian, Manfaat Penelitian.',
  ],
  [
    'BAB II',
    'TINJAUAN PUSTAKA',
    'Landasan Teori, Penelitian Terdahulu, Kerangka Berpikir, dan Hipotesis bila relevan.',
  ],
  [
    'BAB III',
    'METODE PENELITIAN',
    'Jenis/Pendekatan Penelitian, Lokasi dan Waktu, Populasi dan Sampel/Subjek, Variabel/Fokus, Teknik Pengumpulan Data, Instrumen, Teknik Analisis Data, Etika Penelitian.',
  ],
  [
    'BAB IV',
    'HASIL PENELITIAN DAN PEMBAHASAN',
    'Jangan mengarang data, angka, hasil wawancara, atau temuan. Buat struktur analisis, contoh tabel kosong, panduan interpretasi, dan placeholder [MASUKKAN DATA PENELITIAN].',
  ],
  [
    'BAB V',
    'PENUTUP',
    'Kesimpulan sementara yang perlu disesuaikan dengan hasil nyata, keterbatasan, dan saran yang logis.',
  ],
];

export const researchActions = {
  'ai-check': async (_body, config) => {
    try {
      const result = await complete(
        config.ollamaKey,
        [
          {
            role: 'system',
            content: 'You are a connection test. Reply with exactly OK.',
          },
          { role: 'user', content: 'Reply exactly: OK' },
        ],
        0,
        16
      );
      return reply({
        ok: true,
        model: result.model,
        message:
          'Koneksi Ollama Cloud berhasil dan model mengembalikan respons.',
      });
    } catch (e) {
      return failure(e.message);
    }
  },

  'suggest-titles': async (body, config) => {
    const b = body || {},
      keywords = clean(b.keywords).trim();
    if (!keywords)
      return failure('Masukkan kata kunci judul terlebih dahulu.', 400);
    const system =
      'Anda adalah profesor pembimbing dan konsultan metodologi penelitian. Kembangkan topik menjadi alternatif judul akademik yang kuat, spesifik, layak diteliti, dan sesuai metodologi.';
    const prompt = `PENGAJUAN JUDUL/TOPIK: "${keywords}". Bidang: ${clean(b.field, 'Belum ditentukan')}. Jenis penelitian: ${clean(b.researchType, 'Kuantitatif')}. Buat TEPAT 8 alternatif judul yang benar-benar berbeda. Jangan mengarang lokasi, populasi, sampel, lembaga, atau data. Hindari klaim sebab-akibat untuk desain non-eksperimental. Keluarkan hanya JSON valid berupa array 8 string judul.`;
    try {
      const result = await complete(
        config.ollamaKey,
        [
          { role: 'system', content: system + ' ' + outputInstruction(b.outputLanguage) },
          { role: 'user', content: prompt },
        ],
        0.45
      );
      const titles = parseTitles(result.content);
      if (titles.length < 5)
        return failure(
          'Model AI belum berhasil menghasilkan minimal 5 judul yang dapat dibaca.'
        );
      return reply({ titles, count: titles.length, model: result.model });
    } catch (e) {
      return failure(e.message);
    }
  },

  generate: async (body, config) => {
    const b = body || {},
      title = clean(b.title).trim(),
      refs = usableReferences(b.references);
    if (!title) return failure('Judul penelitian wajib diisi.', 400);
    if (!refs.length)
      return failure('Pilih minimal satu referensi sebelum membuat draf.', 400);
    const refsText = refs
      .map(
        (r, i) =>
          `[${i + 1}] Jenis: ${r.kind || 'Sumber'}; Penulis: ${r.authors || 'Belum terverifikasi'}; Tahun: ${r.year || 'Belum terverifikasi'}; Judul: ${r.title || 'Tanpa judul'}; Penerbit/Jurnal: ${r.publisher || r.journal || 'Belum terverifikasi'}; URL: ${r.url || 'Tidak tersedia'}; Ringkasan: ${r.snippet || 'Tidak tersedia'}`
      )
      .join('\n');
    const i = b.chapterIndex;
    if (!Number.isInteger(i) || i < 0 || i >= chapterGuides.length)
      return failure('Bab tidak valid.', 400);
    try {
      const [chapter, heading] = chapterHeadings[i];
      const outline = chapterGuides[i][2];
      const pages = Math.max(
        1,
        Math.min(
          100,
          Number(b.pageTargets?.[i]?.pages) || [10, 25, 15, 20, 10][i]
        )
      );
      const totalTarget = Math.max(1, Math.min(50_000, Number(b.targetWords) || pages * 250));
      const words = Math.max(30, Math.min(650, Number(b.chunkWords) || totalTarget));
      const prior = clean(b.existingText);
      const continuation = b.mode === 'extend' && prior.trim();
      const quantitativeEvidence = clean(b.quantitativeEvidence).slice(0, 12_000);
      const chapterContext = continuation
        ? 'Lanjutkan bab ini dengan materi baru. Jangan menulis ulang pembuka atau mengulang isi. Ringkasan struktur: ' +
          prior.split('\n').filter(line => /^#{1,6}\s/.test(line)).slice(0, 30).join(' | ') +
          '\nAkhir draf sebelumnya:\n' + prior.slice(-5500)
        : 'Mulai draf bab dengan subbagian yang sesuai. Akhiri pada akhir paragraf.';
      const prompt = `Tulis ${chapter} – ${heading} sesuai bahasa keluaran. ${chapterContext}
Target keseluruhan ${pages} halaman atau ${totalTarget} kata. Respons kali ini sekitar ${words} kata. Akhiri pada akhir paragraf.
Judul: ${title}. Bidang: ${clean(b.field)}. Jenis: ${clean(b.researchType)}. Metode: ${clean(b.method)}. Kutipan: ${clean(b.citationStyle, 'APA 7')}.
Subbagian: ${outline}. Instruksi pengguna: ${clean(b.instructions)}.
Referensi yang disediakan pengguna, termasuk buku, jurnal, artikel dan website:
${refsText}
Gunakan hanya sumber yang relevan, bedakan teori, hasil riset dan informasi situs. Jangan mengarang isi sumber, kutipan, DOI, angka atau kesimpulan empiris.
Hasil analisis yang tersedia: ${quantitativeEvidence || 'belum tersedia'}.
BAB IV: gunakan hasil analisis yang diberikan jika tersedia. Jika belum ada data, gunakan [MASUKKAN DATA PENELITIAN]. Jangan mengarang data. BAB V hanya boleh menyimpulkan temuan yang diberikan; jika belum ada, tandai sebagai bagian yang perlu dilengkapi.`;
      const result = await complete(config.ollamaKey, [
        {
          role: 'system',
          content:
            'Bantu penulisan ilmiah secara jujur. Akurasi dan integritas akademik lebih penting daripada mengisi kekosongan dengan dugaan. ' + outputInstruction(b.outputLanguage),
        },
        { role: 'user', content: prompt },
      ], 0.35, Math.min(1400, Math.max(150, Math.ceil(words * (languageInfo(b.outputLanguage).cjk ? 3.2 : 2.1)))));
      const needsData = i === 3 && !continuation && !quantitativeEvidence.trim() && !result.content.includes(dataMarker);
      const content = needsData
        ? dataMarker + '\n\n' + result.content
        : result.content;
      return reply({
        chapter: { chapter, heading, content, model: result.model },
      });
    } catch (e) {
      return failure(e.message);
    }
  },

  questions: async (body, config) => {
    const title = clean(body.title).trim();
    if (!title) return failure('Isi judul penelitian terlebih dahulu.', 400);
    try {
      const result = await complete(config.ollamaKey, [
        {
          role: 'system',
          content:
            'Anda pembimbing metodologi. Tulis 3–5 pertanyaan penelitian, satu per baris. Jangan mengarang populasi atau data. Hindari klaim sebab-akibat jika desainnya non-eksperimental. ' + outputInstruction(body.outputLanguage),
        },
        {
          role: 'user',
          content: JSON.stringify({
            title,
            field: body.field,
            method: body.method,
            researchType: body.researchType,
            objective: body.objective,
          }),
        },
      ]);
      return reply({ questions: result.content });
    } catch (e) {
      return failure(e.message);
    }
  },
  instrument: async (body, config) => {
    const b = body || {},
      title = clean(b.title).trim(),
      objective = clean(b.objective).trim();
    if (!title || !objective)
      return failure('Judul dan tujuan/aspek instrumen wajib diisi.', 400);
    const refs = usableReferences(b.references);
    const context = refs
      .map(
        (r, i) =>
          `${i + 1}. ${r.authors || 'Penulis belum terverifikasi'} (${r.year || 'tahun tidak tersedia'}), ${r.title || 'tanpa judul'}`
      )
      .join('\n');
    try {
      const result = await complete(
        config.ollamaKey,
        [
          {
            role: 'system',
            content:
              'Anda ahli metodologi penelitian. Buat instrumen penelitian yang operasional, terstruktur, etis, dan selaras dengan desain penelitian. Jangan mengklaim instrumen tervalidasi. ' + outputInstruction(b.outputLanguage),
          },
          {
            role: 'user',
            content: `Buat DRAF instrumen penelitian sesuai bahasa keluaran. Judul: ${title}. Bidang: ${clean(b.field, 'Belum ditentukan')}. Jenis: ${clean(b.researchType, 'Kuantitatif')}. Metode: ${clean(b.method, 'Belum ditentukan')}. Jenis instrumen: ${clean(b.type, 'Rekomendasikan sesuai metode')}. Responden/sumber data: ${clean(b.respondent, 'Belum ditentukan')}. Tujuan/aspek: ${objective}. Skala/bentuk jawaban: ${clean(b.scale, 'Sesuai instrumen')}. Referensi konteks: ${context || 'Belum ada referensi'}. Buat identitas dan tujuan, definisi operasional, kisi-kisi dan butir lengkap sebagai tabel Markdown dengan header dan baris pemisah, petunjuk, skala dan penskoran, pemetaan butir, prosedur uji validitas/reliabilitas atau triangulasi, serta etika penelitian. Hindari butir menggiring/ganda/ambigu. Jangan mengarang hasil uji atau mengklaim instrumen tervalidasi. Tandai bagian belum jelas [PERLU DIKONFIRMASI].`,
          },
        ],
        0.25
      );
      return reply({ instrument: result.content, model: result.model });
    } catch (e) {
      return failure(e.message);
    }
  },

  search: async (body, config) => {
    const query = clean(body?.query).trim(),
      source = clean(body?.source, 'crossref');
    if (!query) return failure('Masukkan kata kunci pencarian.', 400);
    if (query.length > 250) return failure('Gunakan maksimal 250 karakter untuk pencarian.', 400);
    try {
      if (source === 'crossref' || (source === 'google' && (!config.googleKey || !config.googleCse))) {
        return reply({ items: await searchCrossref(query, body.kind), source: 'Crossref' });
      }
      if (source === 'scholar') {
        if (!config.serpKey)
          return failure(
            'Pencarian Google Scholar memerlukan SERPAPI_KEY. Tambahkan pada secret deployment. Referensi manual tetap dapat digunakan.'
          );
        const url = new URL('https://serpapi.com/search.json');
        url.search = new URLSearchParams({
          engine: 'google_scholar',
          q: query,
          api_key: config.serpKey,
        });
        const response = await fetch(url, {
          signal: AbortSignal.timeout(12_000),
        });
        if (!response.ok)
          throw new Error('Layanan Google Scholar tidak dapat diakses.');
        const data = await response.json();
        const items = (data.organic_results || []).map((x, i) => ({
          id: `sch-${i}-${Date.now()}`,
          title: x.title || 'Tanpa judul',
          authors: (x.publication_info?.authors || [])
            .map(a => a.name || '')
            .join(', '),
          year:
            (x.publication_info?.summary || '').match(
              /\b(19|20)\d{2}\b/
            )?.[0] || '',
          publisher: x.publication_info?.summary || '',
          url: x.link || '',
          snippet: x.snippet || '',
          source: 'Google Scholar',
        }));
        return reply({ items });
      }
      if (source !== 'google') return failure('Layanan pencarian tidak dikenali.', 400);
      const url = new URL('https://www.googleapis.com/customsearch/v1');
      url.search = new URLSearchParams({
        key: config.googleKey,
        cx: config.googleCse,
        q: query,
        num: '10',
      });
      const response = await fetch(url, {
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok)
        throw new Error(
          'Google Search API gagal. Periksa kuota dan konfigurasi.'
        );
      const data = await response.json();
      return reply({
        items: (data.items || []).map((x, i) => ({
          id: `goo-${i}-${Date.now()}`,
          title: x.title || 'Tanpa judul',
          authors: '',
          year: '',
          publisher: x.displayLink || '',
          url: x.link || '',
          snippet: x.snippet || '',
          source: 'Google Search',
          kind: 'Website',
        })),
      });
    } catch {
      return failure(
        'Pencarian referensi belum tersedia. Coba lagi atau masukkan referensi secara manual.',
        502
      );
    }
  },
};

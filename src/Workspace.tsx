import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@appdeploy/client';
import {
  dataMarker,
  safeSourceUrl,
  usableReferences,
  type Project,
  type Reference,
} from '../shared/project.mjs';
import {
  BookOpen,
  FileText,
  Search,
  Settings2,
  Sparkles,
  Plus,
  Download,
  Trash2,
  RefreshCw,
  Library,
  GraduationCap,
  Menu,
  X,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

type Status = {
  ai: boolean;
  models: string[];
  google: boolean;
  scholar: boolean;
};
type WorkspaceProps = {
  id: string;
  initial: Project;
  initialRevision: number;
  onBack: () => void;
};
type PendingSave = { revision: number; saveId: string; project: Project };
const errorMessage = (error: unknown) => {
  const response = (
    error as { response?: { data?: { error?: string } }; message?: string }
  )?.response;
  const message =
    response?.data?.error || (error instanceof Error ? error.message : '');
  return message || 'Permintaan gagal. Periksa koneksi dan coba lagi.';
};

export default function Workspace({
  id,
  initial,
  initialRevision,
  onBack,
}: WorkspaceProps) {
  const [tab, setTab] = useState('workspace');
  const [mobileNav, setMobileNav] = useState(false);
  const [title, setTitle] = useState(initial.title);
  const [field, setField] = useState(initial.field);
  const [method, setMethod] = useState(initial.method);
  const [researchType, setResearchType] = useState(initial.researchType);
  const [citationStyle, setCitationStyle] = useState(initial.citationStyle);
  const [instructions, setInstructions] = useState(initial.instructions);
  const [refs, setRefs] = useState(initial.refs);
  const [chapters, setChapters] = useState(initial.chapters);
  const [activeChapter, setActiveChapter] = useState(0);
  const [status, setStatus] = useState<Status | null>(null);
  const [aiCheck, setAiCheck] = useState<{
    ok: boolean;
    message: string;
    model?: string;
  } | null>(null);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [noticeError, setNoticeError] = useState(false);
  const [keywords, setKeywords] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('crossref');
  const [results, setResults] = useState<Reference[]>([]);
  const [refForm, setRefForm] = useState({
    title: '',
    authors: '',
    year: '',
    publisher: '',
    url: '',
    snippet: '',
  });
  const [instrumentType, setInstrumentType] = useState(initial.instrumentType);
  const [respondent, setRespondent] = useState(initial.respondent);
  const [objective, setObjective] = useState(initial.objective);
  const [scale, setScale] = useState(initial.scale);
  const [instrument, setInstrument] = useState(initial.instrument);
  const [pageTargets, setPageTargets] = useState(initial.pageTargets);

  const [questions, setQuestions] = useState(initial.questions);
  const [saved, setSaved] = useState(initial);
  const [saving, setSaving] = useState(false);
  const revision = useRef(initialRevision);
  const pending = useRef<PendingSave | null>(null);
  const project: Project = {
    title,
    field,
    method,
    researchType,
    citationStyle,
    instructions,
    questions,
    refs,
    chapters,
    instrumentType,
    respondent,
    objective,
    scale,
    instrument,
    pageTargets,
  };
  const dirty = JSON.stringify(project) !== JSON.stringify(saved);
  const flash = (message: string, failed = false) => {
    setNotice(message);
    setNoticeError(failed);
  };

  useEffect(() => {
    api
      .get('/api/status')
      .then(r => setStatus(r.data as Status))
      .catch(() => flash('Status layanan belum dapat diperiksa.', true));
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function saveProject() {
    if (saving || !dirty) return;
    setSaving(true);
    try {
      // Reuse the original request after an ambiguous network failure.
      const attempt = pending.current ?? {
        revision: revision.current,
        saveId: crypto.randomUUID(),
        project,
      };
      pending.current = attempt;
      const { data } = await api.put('/api/projects/' + id, attempt);
      revision.current = data.revision;
      pending.current = null;
      setSaved(attempt.project);
      flash('Proyek tersimpan.');
    } catch (error) {
      const code = (error as { response?: { status?: number } }).response
        ?.status;
      if (code === 400 || code === 409 || code === 413) pending.current = null;
      flash(errorMessage(error), true);
    } finally {
      setSaving(false);
    }
  }

  function goBack() {
    if (saving || busy) return;
    if (
      !dirty ||
      window.confirm(
        'Ada perubahan yang belum disimpan. Kembali ke daftar proyek?'
      )
    )
      onBack();
  }

  const totalWords = useMemo(
    () =>
      chapters.reduce(
        (n, c) =>
          n + (c.content.trim() ? c.content.trim().split(/\s+/).length : 0),
        0
      ),
    [chapters]
  );
  const testOllama = async () => {
    setBusy('ai-check');
    setAiCheck(null);
    try {
      const r = await api.post('/api/ai-check', {});
      const v = { ok: true, message: r.data.message, model: r.data.model };
      setAiCheck(v);
      flash(v.message + ' Model: ' + v.model);
    } catch (e) {
      const message = errorMessage(e);
      setAiCheck({ ok: false, message });
      flash(message);
    } finally {
      setBusy('');
    }
  };
  const addReference = (ref: Omit<Reference, 'id'>) => {
    if (!ref.title.trim()) return flash('Judul referensi wajib diisi.', true);
    setRefs(prev => [
      ...prev,
      { ...ref, id: crypto.randomUUID(), verified: ref.source === 'Manual' },
    ]);
    setRefForm({
      title: '',
      authors: '',
      year: '',
      publisher: '',
      url: '',
      snippet: '',
    });
    flash('Referensi ditambahkan. Klik Simpan untuk memperbarui proyek.');
  };
  const runTitles = async () => {
    const proposal = keywords.trim() || title.trim();
    if (!proposal)
      return flash('Masukkan judul atau topik usulan Anda terlebih dahulu.');
    setBusy('titles');
    setSuggestions([]);
    try {
      const r = await api.post('/api/suggest-titles', {
        keywords: proposal,
        field,
        researchType,
      });
      const choices = Array.isArray(r.data.titles)
        ? r.data.titles
            .filter((x: unknown) => typeof x === 'string' && x.trim())
            .slice(0, 8)
        : [];
      if (choices.length < 5)
        throw new Error('AI belum menghasilkan minimal 5 pilihan judul.');
      setSuggestions(choices);
      flash(`Berhasil! AI memberikan ${choices.length} alternatif judul.`);
    } catch (e) {
      flash(errorMessage(e), true);
    } finally {
      setBusy('');
    }
  };
  const searchRefs = async () => {
    if (!query.trim()) return flash('Masukkan kata kunci pencarian.', true);
    setResults([]);
    setNotice('');
    setBusy('search');
    try {
      const r = await api.post('/api/search', { query, source });
      const items = Array.isArray(r.data.items) ? r.data.items : [];
      setResults(items);
      if (!items.length) flash('Tidak ada hasil. Coba judul, DOI, atau kata kunci lain.');
      else if (r.data.source === 'Crossref' && source !== 'crossref') flash('Hasil ditampilkan dari Crossref.');
    } catch (e) {
      flash(errorMessage(e), true);
    } finally {
      setBusy('');
    }
  };
  async function runQuestions() {
    if (!title.trim())
      return flash('Isi judul penelitian terlebih dahulu.', true);
    if (
      questions.trim() &&
      !window.confirm('Ganti pertanyaan penelitian saat ini dengan draf AI?')
    )
      return;
    setBusy('questions');
    try {
      const { data } = await api.post('/api/questions', {
        title,
        field,
        method,
        researchType,
        objective,
      });
      setQuestions(current =>
        current === questions ? data.questions : current
      );
      flash('Draf pertanyaan penelitian siap ditelaah.');
    } catch (error) {
      flash(errorMessage(error), true);
    } finally {
      setBusy('');
    }
  }

  function updateChapter(value: string) {
    setChapters(previous =>
      previous.map((chapter, index) =>
        index === activeChapter ? { ...chapter, content: value } : chapter
      )
    );
  }

  async function generate() {
    if (!title.trim()) return flash('Judul penelitian wajib diisi.', true);
    const references = usableReferences(refs);
    if (!references.length)
      return flash(
        'Tambahkan referensi manual atau tandai hasil pencarian yang sudah diperiksa.',
        true
      );
    const untouched = chapters
      .map((chapter, index) => ({ chapter, index }))
      .filter(
        ({ chapter }) =>
          !chapter.content.trim() || chapter.content.trim() === dataMarker
      );
    const targets = untouched.length
      ? untouched.map(({ index }) => index)
      : chapters.map((_, index) => index);
    if (
      !untouched.length &&
      !window.confirm(
        'Semua bab sudah terisi. Ganti isi BAB I–V dengan draf AI?'
      )
    )
      return;
    setTab('draft');
    setActiveChapter(targets[0] ?? 0);
    setBusy('generate');
    let completed = 0;
    try {
      for (const chapterIndex of targets) {
        flash(`Menyusun ${chapters[chapterIndex].chapter} (${completed + 1}/${targets.length})…`);
        const { data } = await api.post('/api/generate', {
          title,
          field,
          method,
          researchType,
          citationStyle,
          references,
          instructions: [
            instructions,
            questions && 'Pertanyaan penelitian: ' + questions,
          ]
            .filter(Boolean)
            .join('\n'),
          pageTargets: pageTargets.map(pages => ({ pages })),
          wordsPerPage: 250,
          chapterIndex,
        });
        setChapters(previous =>
          previous.map((chapter, index) =>
            index === chapterIndex &&
            chapter.content === chapters[index].content
              ? data.chapter
              : chapter
          )
        );
        completed += 1;
      }
      flash('Draf siap ditelaah. Klik Simpan untuk memperbarui proyek.');
    } catch (error) {
      const message = errorMessage(error);
      flash(completed > 0
        ? message + ' Bab yang selesai tetap ada di editor. Klik Simpan, lalu gunakan Generate BAB I–V untuk melanjutkan.'
        : message, true);
    } finally {
      setBusy('');
    }
  }

  async function generateInstrument() {
    if (!title.trim() || !objective.trim())
      return flash('Judul dan tujuan instrumen wajib diisi.', true);
    if (
      instrument.trim() &&
      !window.confirm('Ganti isi instrumen dengan draf AI?')
    )
      return;
    setBusy('instrument');
    try {
      const { data } = await api.post('/api/instrument', {
        title,
        field,
        method,
        researchType,
        type: instrumentType,
        respondent,
        objective,
        scale,
        references: usableReferences(refs),
      });
      setInstrument(current =>
        current === instrument ? data.instrument : current
      );
      flash('Draf instrumen siap ditelaah.');
    } catch (error) {
      flash(errorMessage(error), true);
    } finally {
      setBusy('');
    }
  }

  async function exportWord(kind: 'chapters' | 'instrument') {
    setBusy('export');
    try {
      const { downloadWord } = await import('./word.mjs');
      await downloadWord(project, kind);
      flash('Dokumen Word siap diunduh.');
    } catch {
      flash('Dokumen Word gagal disiapkan. Coba unduh kembali.', true);
    } finally {
      setBusy('');
    }
  }

  const nav = [
    { id: 'workspace', label: 'Ruang kerja', icon: BookOpen },
    { id: 'references', label: 'Referensi', icon: Library },
    { id: 'draft', label: 'Draf BAB I–V', icon: FileText },
    { id: 'instrument', label: 'Instrumen', icon: GraduationCap },
    { id: 'settings', label: 'Model & layanan', icon: Settings2 },
  ];
  const generateButton = (
    <button
      type="button"
      className="primary-btn large"
      onClick={generate}
      disabled={!!busy}
    >
      <Sparkles size={16} />
      {busy === 'generate' ? 'Menyusun BAB I–V…' : 'Generate BAB I–V'}
    </button>
  );

  return (
    <div className="app-shell">
      <aside className={mobileNav ? 'sidebar open' : 'sidebar'}>
        <div className="brand">
          <div className="brand-mark">R</div>
          <div>
            <b>RisetAI</b>
            <small>ACADEMIC STUDIO</small>
          </div>
          <button
            className="close-nav"
            aria-label="Tutup menu"
            onClick={() => setMobileNav(false)}
          >
            <X size={18} />
          </button>
        </div>
        <button
          className="new-btn"
          onClick={goBack}
          disabled={saving || !!busy}
        >
          ← <span>Daftar proyek</span>
        </button>
        <div className="nav-label">PROYEK</div>
        {nav.map(item => (
          <button
            key={item.id}
            className={tab === item.id ? 'nav active' : 'nav'}
            onClick={() => {
              setTab(item.id);
              setMobileNav(false);
            }}
          >
            <item.icon size={17} />
            <span>{item.label}</span>
            {item.id === 'references' && <em>{refs.length}</em>}
          </button>
        ))}
        <div className="sidebar-bottom">
          <div className="status-card">
            <span className="pulse" />
            <div>
              <b>
                {aiCheck?.ok
                  ? 'Ollama Cloud aktif'
                  : status?.ai
                    ? 'API Key terpasang'
                    : 'Menunggu konfigurasi AI'}
              </b>
              <small>Model cloud dengan fallback otomatis</small>
            </div>
          </div>
          <small className="version">RISET AI · ACADEMIC STUDIO</small>
        </div>
      </aside>
      {mobileNav && (
        <button
          className="scrim"
          onClick={() => setMobileNav(false)}
          aria-label="Tutup menu"
        />
      )}
      <main className="main">
        <header className="topbar">
          <button
            className="mobile-menu"
            aria-label="Buka menu"
            onClick={() => setMobileNav(true)}
          >
            <Menu />
          </button>
          <div className="crumb">
            RisetAI <span>/</span> <b>{nav.find(n => n.id === tab)?.label}</b>
          </div>
          <div className="top-actions">
            <span className="save-state" aria-live="polite">
              {dirty ? 'Belum disimpan' : 'Tersimpan'}
            </span>
            <button
              className="primary-btn"
              onClick={saveProject}
              disabled={saving || !dirty}
            >
              {saving ? 'Menyimpan…' : 'Simpan'}
            </button>
          </div>
        </header>
        <div className="content">
          {notice && (
            <div
              className={noticeError ? 'notice error' : 'notice'}
              role={noticeError ? 'alert' : 'status'}
            >
              {noticeError ? (
                <AlertCircle size={16} />
              ) : (
                <CheckCircle2 size={16} />
              )}
              <span>{notice}</span>
              <button
                aria-label="Tutup pemberitahuan"
                onClick={() => setNotice('')}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {tab === 'workspace' && (
            <>
              <div className="status-strip">
                <div>
                  <span
                    className={aiCheck?.ok ? 'status-dot good' : 'status-dot'}
                  />
                  {aiCheck?.ok
                    ? 'Ollama Cloud teruji dan merespons'
                    : status?.ai
                      ? 'API Key terpasang · koneksi AI belum diuji'
                      : 'Layanan AI bersama belum dikonfigurasi'}
                </div>
                <div>
                  <span className="status-dot good" />
                  Pencarian referensi Crossref
                </div>
                <span className="strip-note">Penyimpanan akun</span>
              </div>
              <section className="panel">
                <div className="section-head">
                  <div>
                    <h2>Detail penelitian</h2>
                    <p>
                      Lengkapi informasi dasar sebagai konteks penulisan
                      akademik.
                    </p>
                  </div>
                </div>
                <label className="field-label">Judul karya ilmiah *</label>
                <textarea
                  aria-label="Judul karya ilmiah"
                  maxLength={300}
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  rows={2}
                  placeholder="Tuliskan judul penelitian..."
                />
                <label className="field-label">
                  Usulkan minimal 5 alternatif dari judul/topik Anda
                </label>
                <div className="inline-form">
                  <input
                    value={keywords}
                    onChange={e => setKeywords(e.target.value)}
                    placeholder="Masukkan judul usulan atau topik penelitian Anda..."
                  />
                  <button
                    className="primary-btn"
                    onClick={runTitles}
                    disabled={!!busy}
                  >
                    <Sparkles size={15} />
                    {busy === 'titles' ? 'Menyusun...' : 'Usulkan judul'}
                  </button>
                </div>
                {suggestions.length > 0 && (
                  <div className="suggestion-result">
                    <div className="suggestion-result-head">
                      <b>{suggestions.length} alternatif judul penelitian</b>
                      <span>
                        Klik judul untuk memilih dan memasukkannya ke kolom
                        judul karya ilmiah.
                      </span>
                    </div>
                    <div className="suggestions">
                      {suggestions.map((s, i) => (
                        <button key={i} onClick={() => setTitle(s)}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="form-grid">
                  <div>
                    <label className="field-label">
                      Bidang / program studi
                    </label>
                    <input
                      value={field}
                      onChange={e => setField(e.target.value)}
                      placeholder="Pendidikan, Sosiologi, Manajemen..."
                    />
                  </div>
                  <div>
                    <label className="field-label">Jenis penelitian</label>
                    <select
                      value={researchType}
                      onChange={e => setResearchType(e.target.value)}
                    >
                      <option>Kuantitatif</option>
                      <option>Kualitatif</option>
                    </select>
                  </div>
                </div>
                <div className="form-grid">
                  <div>
                    <label className="field-label">
                      Metode / desain penelitian
                    </label>
                    <select
                      value={method}
                      onChange={e => setMethod(e.target.value)}
                    >
                      <option value="">Pilih metode</option>
                      {[
                        'Deskriptif',
                        'Korelasional',
                        'Eksperimen / Quasi eksperimen',
                        'Survei',
                        'Studi kasus',
                        'Fenomenologi',
                        'Etnografi',
                        'Grounded theory',
                        'Naratif',
                        'Studi literatur / Systematic Literature Review',
                        'Research and Development (R&D)',
                      ].map(x => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Gaya kutipan</label>
                    <select
                      value={citationStyle}
                      onChange={e => setCitationStyle(e.target.value)}
                    >
                      {[
                        'APA 7',
                        'Harvard',
                        'Chicago Author-Date',
                        'MLA',
                        'IEEE',
                        'Vancouver',
                        'AMA',
                        'Chicago/Turabian Notes-Bibliography',
                        'Footnote',
                        'Endnote',
                      ].map(x => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <label className="field-label" htmlFor="research-questions">
                  Pertanyaan penelitian
                </label>
                <textarea
                  id="research-questions"
                  value={questions}
                  onChange={event => setQuestions(event.target.value)}
                  rows={4}
                  placeholder="Tulis pertanyaan penelitian yang ingin dijawab."
                />
                <button
                  className="secondary-btn"
                  onClick={runQuestions}
                  disabled={!!busy}
                >
                  <Sparkles size={15} />
                  {busy === 'questions' ? 'Menyusun…' : 'Usulkan pertanyaan'}
                </button>
                <label className="field-label">Instruksi tambahan</label>
                <textarea
                  value={instructions}
                  onChange={e => setInstructions(e.target.value)}
                  rows={2}
                  placeholder="Pedoman kampus, fokus bahasan, batasan, atau arahan khusus..."
                />
                <div className="target-box">
                  <div>
                    <b>Target halaman per bab</b>
                    <small>Estimasi panjang awal, dapat disesuaikan.</small>
                  </div>
                  <div className="target-grid">
                    {pageTargets.map((p, i) => (
                      <label key={i}>
                        BAB {i + 1}
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={p}
                          onChange={e =>
                            setPageTargets(prev =>
                              prev.map((v, j) =>
                                i === j
                                  ? Math.max(1, Number(e.target.value))
                                  : v
                              )
                            )
                          }
                        />
                      </label>
                    ))}
                  </div>
                </div>
                <div className="action-row">
                  <span className="helper">
                    {refs.length} referensi dipilih · Target{' '}
                    {pageTargets.reduce((a, b) => a + b, 0)} halaman
                  </span>
                  <button
                    className="primary-btn large"
                    onClick={() => setTab('references')}
                  >
                    Lanjut: kelola referensi <Search size={16} />
                  </button>
                </div>
              </section>
              <section className="panel generate-panel">
                <div>
                  <h2>Susun draf penelitian</h2>
                  <p>
                    AI mengisi bab kosong berdasarkan detail penelitian dan
                    referensi yang telah dipilih. BAB IV menyediakan penanda
                    untuk data yang perlu dilengkapi.
                  </p>
                </div>
                {generateButton}
              </section>
            </>
          )}
          {tab === 'references' && (
            <section className="panel">
              <div className="section-head">
                <div>
                  <h2>Referensi penelitian</h2>
                  <p>
                    Cari publikasi melalui Crossref. Buka sumber dan periksa metadatanya sebelum menggunakan referensi.
                  </p>
                </div>
                <span className="step-tag">{refs.length} REFERENSI</span>
              </div>
              <div className="search-box">
                <div className="inline-form">
                  <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={event => { if (event.key === 'Enter' && !busy) void searchRefs(); }}
                    maxLength={250}
                    aria-label="Kata kunci referensi"
                    placeholder="Cari judul, penulis, atau kata kunci..."
                  />
                  <select
                    aria-label="Layanan pencarian"
                    value={source}
                    onChange={e => setSource(e.target.value)}
                  >
                    <option value="crossref">Crossref</option>
                    {status?.google && <option value="google">Google Search</option>}
                    {status?.scholar && <option value="scholar">Google Scholar</option>}
                  </select>
                  <button
                    className="primary-btn"
                    onClick={searchRefs}
                    disabled={!!busy}
                  >
                    <Search size={15} />
                    {busy === 'search' ? 'Mencari...' : 'Cari'}
                  </button>
                </div>
                <div className="card-actions">
                  <a
                    className="secondary-btn"
                    href={'https://scholar.google.com/scholar' + (query.trim() ? '?q=' + encodeURIComponent(query.trim()) : '')}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Buka Google Scholar
                  </a>
                </div>
              </div>
              {results.length > 0 && (
                <div className="result-list">
                  {results.map((r, i) => (
                    <article className="reference-card" key={r.id || i}>
                      <b>{r.title}</b>
                      <p>
                        {r.authors} {r.year && `(${r.year})`} · {r.publisher}
                      </p>
                      <small>{r.source}{r.snippet ? ' · ' + r.snippet : ''}</small>
                      <div className="card-actions">
                        {safeSourceUrl(r.url) && (
                          <a
                            href={safeSourceUrl(r.url)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Buka sumber
                          </a>
                        )}
                        <button
                          className="secondary-btn"
                          onClick={() => addReference(r)}
                        >
                          ＋ Tambahkan
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
              <div className="subhead">
                <h3>Tambah referensi manual</h3>
                <p>
                  Pastikan metadata dan tautan sumber diperiksa terhadap dokumen
                  aslinya.
                </p>
              </div>
              <div className="form-grid">
                <div>
                  <label className="field-label">Judul sumber *</label>
                  <input
                    value={refForm.title}
                    onChange={e =>
                      setRefForm({ ...refForm, title: e.target.value })
                    }
                    placeholder="Judul artikel atau buku"
                  />
                </div>
                <div>
                  <label className="field-label">Penulis</label>
                  <input
                    value={refForm.authors}
                    onChange={e =>
                      setRefForm({ ...refForm, authors: e.target.value })
                    }
                    placeholder="Nama penulis"
                  />
                </div>
              </div>
              <div className="form-grid">
                <div>
                  <label className="field-label">Tahun</label>
                  <input
                    value={refForm.year}
                    onChange={e =>
                      setRefForm({ ...refForm, year: e.target.value })
                    }
                    placeholder="2024"
                  />
                </div>
                <div>
                  <label className="field-label">Jurnal / penerbit</label>
                  <input
                    value={refForm.publisher}
                    onChange={e =>
                      setRefForm({ ...refForm, publisher: e.target.value })
                    }
                    placeholder="Nama jurnal atau penerbit"
                  />
                </div>
              </div>
              <label className="field-label">URL / DOI</label>
              <input
                value={refForm.url}
                onChange={e => setRefForm({ ...refForm, url: e.target.value })}
                placeholder="https://doi.org/..."
              />
              <label className="field-label">Ringkasan / catatan sumber</label>
              <textarea
                rows={2}
                value={refForm.snippet}
                onChange={e =>
                  setRefForm({ ...refForm, snippet: e.target.value })
                }
                placeholder="Catatan singkat tentang relevansi sumber..."
              />
              <button
                className="primary-btn"
                onClick={() => addReference({ ...refForm, source: 'Manual' })}
              >
                <Plus size={15} /> Simpan referensi
              </button>
              <div className="subhead">
                <h3>Daftar referensi terpilih</h3>
              </div>
              {refs.length === 0 ? (
                <div className="empty">
                  <Library size={28} />
                  <b>Belum ada referensi</b>
                  <span>
                    Tambahkan setidaknya satu sumber sebelum membuat draf BAB
                    I–V.
                  </span>
                </div>
              ) : (
                refs.map(r => (
                  <article className="reference-card" key={r.id}>
                    <div className="card-top">
                      <b>{r.title}</b>
                      <button
                        className="icon-btn danger"
                        onClick={() =>
                          setRefs(prev => prev.filter(x => x.id !== r.id))
                        }
                        aria-label="Hapus referensi"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <p>
                      {r.authors || 'Penulis belum diverifikasi'}{' '}
                      {r.year && `(${r.year})`} · {r.publisher}
                    </p>
                    {safeSourceUrl(r.url) && (
                      <a
                        href={safeSourceUrl(r.url)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {r.url}
                      </a>
                    )}
                    {r.source !== 'Manual' && (
                      <label className="verify-ref">
                        <input
                          type="checkbox"
                          checked={!!r.verified}
                          onChange={event =>
                            setRefs(previous =>
                              previous.map(item =>
                                item.id === r.id
                                  ? { ...item, verified: event.target.checked }
                                  : item
                              )
                            )
                          }
                        />{' '}
                        Sudah saya periksa
                      </label>
                    )}
                  </article>
                ))
              )}
            </section>
          )}
          {tab === 'draft' && (
            <section className="panel">
              <div className="section-head">
                <div>
                  <h2>Editor draf BAB I–V</h2>
                  <p>
                    Isi judul dan tambahkan referensi yang sudah diperiksa.
                    Setelah draf selesai, sunting bab lalu klik Simpan.
                  </p>
                </div>
                <div className="inline-form">
                  {generateButton}
                  <button
                    className="secondary-btn"
                    onClick={() => exportWord('chapters')}
                    disabled={
                      !!busy ||
                      (!chapters.some(
                        c => c.content.trim() && c.content.trim() !== dataMarker
                      ) &&
                        !instrument.trim() &&
                        !refs.length &&
                        !questions.trim())
                    }
                  >
                    <Download size={15} /> Ekspor Word
                  </button>
                </div>
              </div>
              <div className="draft-stats">
                <div>
                  <b>{chapters.filter(c => c.content.trim() && c.content.trim() !== dataMarker).length}/5</b>
                  <span>Bab tersedia</span>
                </div>
                <div>
                  <b>{totalWords.toLocaleString('id-ID')}</b>
                  <span>Jumlah kata</span>
                </div>
                <div>
                  <b>{refs.length}</b>
                  <span>Referensi</span>
                </div>
              </div>
              <div className="chapter-tabs">
                {chapters.map((c, i) => (
                  <button
                    key={c.chapter}
                    className={
                      activeChapter === i
                        ? 'chapter-tab selected'
                        : 'chapter-tab'
                    }
                    onClick={() => setActiveChapter(i)}
                  >
                    {c.chapter}
                  </button>
                ))}
              </div>
              <div className="editor-heading">
                <div>
                  <span>{chapters[activeChapter].chapter}</span>
                  <h3>{chapters[activeChapter].heading}</h3>
                </div>
                <span className="helper">
                  {chapters[activeChapter].model || 'Draf dapat diedit'}
                </span>
              </div>
              <textarea
                aria-label={chapters[activeChapter].chapter}
                className="chapter-editor"
                value={chapters[activeChapter].content}
                onChange={e => updateChapter(e.target.value)}
                placeholder="Konten bab akan tampil di sini setelah generasi AI, atau tulis/sunting secara manual..."
              />
              <div className="action-row">
                <span className="helper">
                  {chapters[activeChapter].content
                    .trim()
                    .split(/\s+/)
                    .filter(Boolean)
                    .length.toLocaleString('id-ID')}{' '}
                  kata pada bab ini
                </span>
                <button
                  className="secondary-btn"
                  onClick={() =>
                    setChapters(prev =>
                      prev.map((c, i) =>
                        i === activeChapter
                          ? { ...c, content: i === 3 ? dataMarker : '' }
                          : c
                      )
                    )
                  }
                >
                  Kosongkan bab
                </button>
              </div>
              <div className="integrity-note">
                <AlertCircle size={17} />
                <span>
                  Integritas akademik: verifikasi setiap sitasi dan metadata
                  sumber. Jangan mengisi BAB IV dengan data empiris yang belum
                  dikumpulkan. Draf AI bukan pengganti telaah ilmiah.
                </span>
              </div>
            </section>
          )}
          {tab === 'instrument' && (
            <section className="panel">
              <div className="section-head">
                <div>
                  <h2>Generator instrumen penelitian</h2>
                  <p>
                    Buat draf kisi-kisi, butir instrumen, petunjuk, dan rencana
                    uji kualitas.
                  </p>
                </div>
              </div>
              <div className="form-grid">
                <div>
                  <label className="field-label">Jenis instrumen</label>
                  <select
                    value={instrumentType}
                    onChange={e => setInstrumentType(e.target.value)}
                  >
                    {[
                      'Kuesioner',
                      'Pedoman wawancara',
                      'Lembar observasi',
                      'Studi dokumentasi',
                      'Tes',
                    ].map(x => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label">Responden / sumber data</label>
                  <input
                    value={respondent}
                    onChange={e => setRespondent(e.target.value)}
                    placeholder="Siswa, guru, informan, dokumen..."
                  />
                </div>
              </div>
              <label className="field-label">
                Tujuan / aspek yang diukur *
              </label>
              <textarea
                rows={3}
                value={objective}
                onChange={e => setObjective(e.target.value)}
                placeholder="Jelaskan variabel, aspek, atau fokus yang ingin diukur/digali..."
              />
              <label className="field-label">Skala / bentuk jawaban</label>
              <input value={scale} onChange={e => setScale(e.target.value)} />
              <div className="action-row">
                <span className="helper">
                  Instrumen disusun berdasarkan detail penelitian dan referensi
                  terpilih.
                </span>
                <button
                  className="primary-btn"
                  onClick={generateInstrument}
                  disabled={!!busy}
                >
                  <Sparkles size={15} />
                  {busy === 'instrument' ? 'Menyusun...' : 'Susun instrumen'}
                </button>
              </div>
              <div className="subhead">
                <h3>Editor instrumen</h3>
                <p>Sunting hasil sebelum diekspor.</p>
              </div>
              <textarea
                aria-label="Isi instrumen"
                className="chapter-editor"
                value={instrument}
                onChange={e => setInstrument(e.target.value)}
                placeholder="Hasil instrumen akan muncul di sini..."
              />
              <div className="action-row">
                <span className="helper">
                  Klik Simpan untuk menyimpan instrumen ke proyek.
                </span>
                <button
                  className="secondary-btn"
                  onClick={() => exportWord('instrument')}
                  disabled={!instrument.trim() || !!busy}
                >
                  <Download size={15} /> Ekspor instrumen Word
                </button>
              </div>
              <div className="integrity-note">
                <AlertCircle size={17} />
                <span>
                  Instrumen adalah draf. Lakukan telaah ahli, uji coba,
                  validitas/reliabilitas atau triangulasi sesuai desain
                  penelitian. Aplikasi tidak mengklaim instrumen otomatis
                  tervalidasi.
                </span>
              </div>
            </section>
          )}
          {tab === 'settings' && (
            <section className="panel">
              <div className="section-head">
                <div>
                  <h2>Model AI & layanan</h2>
                  <p>
                    Daftar model Ollama Cloud mengikuti urutan fallback yang
                    ditetapkan.
                  </p>
                </div>
                <div className="action-row">
                  <button
                    className="primary-btn"
                    onClick={testOllama}
                    disabled={!!busy || !status?.ai}
                  >
                    <Sparkles size={15} />
                    {busy === 'ai-check'
                      ? 'Menguji koneksi...'
                      : 'Tes koneksi Ollama'}
                  </button>
                  <button
                    className="secondary-btn"
                    onClick={() => {
                      setBusy('status');
                      api
                        .get('/api/status')
                        .then(r => setStatus(r.data as Status))
                        .catch(() => flash('Status gagal diperbarui.'))
                        .finally(() => setBusy(''));
                    }}
                  >
                    <RefreshCw size={15} /> Perbarui status
                  </button>
                </div>
              </div>
              <div className="service-card">
                <div
                  className={
                    aiCheck?.ok ? 'service-indicator good' : 'service-indicator'
                  }
                />
                <div>
                  <b>Ollama Cloud API</b>
                  <p>
                    {aiCheck
                      ? aiCheck.message +
                        (aiCheck.model ? ' Model aktif: ' + aiCheck.model : '')
                      : status?.ai
                        ? 'API Key tersimpan aman di backend. Koneksi model belum dinyatakan berhasil sampai tes dijalankan.'
                        : 'Ollama Cloud belum dikonfigurasi. Tambahkan OLLAMA_API_KEY melalui pengaturan secret deployment.'}
                  </p>
                </div>
              </div>
              <h3 className="subhead-title">Urutan model fallback</h3>
              <ol className="model-list">
                {(status?.models || []).map((m, i) => (
                  <li key={m}>
                    <span>{i + 1}</span>
                    <code>{m}</code>
                  </li>
                ))}
              </ol>
              <div className="service-card muted">
                <div className="service-indicator good" />
                <div>
                  <b>Pencarian referensi</b>
                  <p>Crossref tersedia sebagai layanan bawaan tanpa API key.</p>
                </div>
              </div>
              <div className="integrity-note">
                <AlertCircle size={17} />
                <span>
                  API key hanya dibaca oleh backend dan tidak dikirim ke
                  browser. Proyek yang disimpan tersedia saat Anda masuk dari
                  perangkat lain.
                </span>
              </div>
            </section>
          )}
          <footer>
            RisetAI Academic Studio · Draf akademik berbantuan AI · Verifikasi
            sumber dan hasil sebelum publikasi.
          </footer>
        </div>
      </main>
    </div>
  );
}

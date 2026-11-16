import { useEffect, useRef, useState } from 'react';
import { api, auth } from '@appdeploy/client';
import { BookOpen, ChevronRight, LogOut, Plus } from 'lucide-react';
import { normalizeProject, type Project } from '../shared/project.mjs';
import Workspace from './Workspace';
import Products from './Products';
import { CitationGeneratorButton } from './CitationGenerator';

type User = NonNullable<Awaited<ReturnType<typeof auth.getUser>>>;
type Summary = { id: string; title: string; updatedAt: string; revision: number };
type OpenProject = Summary & { project: Project };

function Dashboard({ onSignOut }: { onSignOut: () => Promise<void> }) {
  const [projects, setProjects] = useState<Summary[]>([]);
  const [showProducts, setShowProducts] = useState(false);
  const [open, setOpen] = useState<OpenProject | null>(null);
  const [cursor, setCursor] = useState('');
  const [working, setWorking] = useState('');
  const [message, setMessage] = useState('');
  const createId = useRef('');

  async function loadProjects(after = '') {
    setWorking('list');
    setMessage('');
    try {
      const { data } = await api.get('/api/projects' + (after ? '?cursor=' + encodeURIComponent(after) : ''));
      setProjects(previous => {
        const combined: Summary[] = after ? [...previous, ...data.items] : data.items;
        return [...new Map(combined.map(project => [project.id, project])).values()]
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      });
      setCursor(data.nextToken || '');
    } catch {
      setMessage('Daftar proyek belum dapat dimuat. Coba muat ulang.');
    } finally {
      setWorking('');
    }
  }

  useEffect(() => {
    void loadProjects();
  }, []);

  async function selectProject(id: string) {
    setWorking('open');
    setMessage('');
    try {
      const { data } = await api.get('/api/projects/' + id);
      setOpen({ ...data, project: normalizeProject(data.project) });
    } catch {
      setMessage('Proyek belum dapat dibuka. Muat ulang daftar atau coba lagi.');
    } finally {
      setWorking('');
    }
  }

  async function createProject() {
    setWorking('create');
    setMessage('');
    try {
      createId.current ||= crypto.randomUUID();
      const { data } = await api.post('/api/projects', { id: createId.current });
      createId.current = '';
      if (data.revision > 0) {
        await selectProject(data.id);
      } else {
        setOpen({ ...data, project: normalizeProject(null) });
      }
    } catch {
      setMessage('Pembuatan proyek belum dapat dikonfirmasi. Klik Proyek baru untuk mencoba lagi.');
    } finally {
      setWorking('');
    }
  }

  if (open) return <Workspace key={open.id} id={open.id} initial={open.project} initialRevision={open.revision}
    onBack={() => { setOpen(null); void loadProjects(); }}/>;

  return <main className="dashboard">
    <header className="portfolio-header">
      <div className="wordmark"><span className="brand-mark"><BookOpen size={20}/></span><strong>RisetAI <span>Academic Studio</span></strong></div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><CitationGeneratorButton/><button className="secondary-btn" type="button" onClick={() => setShowProducts(value => !value)}>{showProducts ? "Proyek penelitian" : "Produk"}</button><button className="secondary-btn" onClick={onSignOut}><LogOut size={16}/> Keluar</button></div>
    </header>
    {showProducts ? <Products onBack={() => setShowProducts(false)}/> : <div className="portfolio-body">
      <div className="portfolio-title">
        <div><h1>Proyek penelitian</h1><p>Buka draf yang tersimpan atau mulai proyek baru.</p></div>
        <button className="primary-btn" onClick={createProject} disabled={!!working}><Plus size={17}/> Proyek baru</button>
      </div>
      {message && <div className="portfolio-error" role="alert">{message} <button className="secondary-btn" onClick={() => loadProjects()}>Muat ulang daftar</button></div>}
      {working && <p role="status">Memuat proyek…</p>}
      {!projects.length && !working && !message && <div className="portfolio-empty"><BookOpen size={26}/><h2>Belum ada proyek</h2><p>Klik Proyek baru untuk mulai menulis.</p></div>}
      <div className="portfolio-list">
        {projects.map(project => <button key={project.id} className="project-card" disabled={!!working} onClick={() => selectProject(project.id)}>
          <BookOpen size={19}/><span><strong>{project.title}</strong><small>Diperbarui {new Date(project.updatedAt).toLocaleDateString('id-ID', { dateStyle: 'medium' })}</small></span><ChevronRight size={19}/>
        </button>)}
      </div>
      {cursor && <button className="secondary-btn" disabled={!!working} onClick={() => loadProjects(cursor)}>Muat proyek lainnya</button>}
    </div>}
  </main>;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    auth.getUser()
      .then(value => { if (active) setUser(value); })
      .catch(() => { if (active) setMessage('Sesi belum dapat dipulihkan. Coba masuk kembali.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function signIn() {
    setSigningIn(true);
    setMessage('');
    try {
      await auth.signInWithRedirect();
    } catch (error) {
      setMessage(String(error).includes('storage-unavailable')
        ? 'Aktifkan penyimpanan browser untuk masuk.'
        : 'Halaman masuk belum dapat dibuka. Coba lagi.');
      setSigningIn(false);
    }
  }

  async function signOut() {
    setMessage('');
    try {
      await auth.signOut();
      setUser(null);
    } catch {
      setMessage('Sesi belum dapat diakhiri. Coba keluar kembali.');
    }
  }

  if (loading) return <main className="login-screen"><p role="status">Memeriksa sesi…</p></main>;
  if (user) return <>{message && <p className="portfolio-error" role="alert">{message}</p>}<Dashboard key={user.userId} onSignOut={signOut}/></>;

  return <main className="login-screen">
    <section className="login-card">
      <div className="brand-mark"><BookOpen size={22}/></div>
      <h1>RisetAI Academic Studio</h1>
      <p>Masuk untuk menyimpan proyek penelitian dan membukanya kembali dari perangkat mana pun.</p>
      {message && <p className="portfolio-error" role="alert">{message}</p>}
      <button className="primary-btn large" onClick={signIn} disabled={signingIn}>{signingIn ? 'Membuka halaman masuk…' : 'Masuk ke RisetAI'}</button>
      <div style={{ marginTop: 12 }}><CitationGeneratorButton/></div>
    </section>
  </main>;
}

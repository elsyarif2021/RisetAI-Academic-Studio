import { useState } from 'react';
import { Download } from 'lucide-react';
import { languageInfo } from '../shared/language.mjs';
import { appendices, frontSections, manuscriptImport, manuscriptSectionText, manuscriptTemplate } from '../shared/manuscript.mjs';
import { usableReferences, type Project } from '../shared/project.mjs';
import type { WordKind } from './word.mjs';

type Props = {
  project: Project;
  onSectionChange: (id: string, text: string) => void;
  openInstrument: () => void;
  onExport: (kind: WordKind) => void;
  busy: boolean;
};

export default function Manuscript({ project, onSectionChange, openInstrument, onExport, busy }: Props) {
  const [sectionId, setSectionId] = useState('approval');
  const [message, setMessage] = useState('');
  const front = frontSections.find(section => section.id === sectionId);
  const appendix = appendices.find(section => section.id === sectionId);
  const title = front?.title || appendix?.title || 'Daftar Pustaka';
  const text = manuscriptSectionText(project, sectionId);
  const { code, rtl } = languageInfo(project.outputLanguage);
  const hasAppendices = appendices.some(section => manuscriptSectionText(project, section.id).trim());
  const refs = usableReferences(project.refs);
  const index = sectionId === 'contents' || sectionId === 'appendixList';
  const editable = (front || appendix) && !index && sectionId !== 'instrument';
  const template = manuscriptTemplate(sectionId, project.title);
  const kind = front ? `section-${sectionId}` as const : appendix ? `appendix-${sectionId}` as const : 'bibliography';
  const exportable = sectionId === 'contents' || (sectionId === 'appendixList' && hasAppendices) ||
    (sectionId === 'bibliography' && refs.length > 0) || !!text.trim();

  function replace(textToInsert: string) {
    if (text.trim() && !window.confirm('Ganti isi bagian ini?')) return;
    onSectionChange(sectionId, textToInsert);
    setMessage('Isi dimasukkan. Klik Simpan untuk menyimpan proyek.');
  }

  function importData() {
    try {
      const value = manuscriptImport(project, sectionId);
      if (!value) return setMessage('Isi data atau hasil di Analisis kuantitatif terlebih dahulu.');
      replace(value);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Data belum bisa dimasukkan.');
    }
  }

  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <h2>Kelengkapan Naskah</h2>
          <p>Isi bagian yang diperlukan, klik Simpan, lalu unduh per bagian atau sebagai naskah lengkap.</p>
        </div>
        <div className="inline-form">
          <button className="primary-btn" disabled={busy} onClick={() => onExport('chapters')}><Download size={15} /> Naskah lengkap</button>
          <button className="secondary-btn" disabled={busy || !hasAppendices} onClick={() => onExport('appendices')}><Download size={15} /> Semua lampiran</button>
        </div>
      </div>
      <label className="field-label" htmlFor="manuscript-section">Bagian naskah</label>
      <select id="manuscript-section" value={sectionId} onChange={event => {
        setSectionId(event.target.value);
        setMessage('');
      }}>
        <optgroup label="Halaman awal">
          {frontSections.map(section => <option key={section.id} value={section.id}>{section.title}</option>)}
        </optgroup>
        <optgroup label="Lampiran">
          {appendices.map(section => <option key={section.id} value={section.id}>{section.title}</option>)}
        </optgroup>
        <option value="bibliography">Daftar Pustaka</option>
      </select>
      <div className="subhead"><h3>{title}</h3></div>
      {editable && <>
        {sectionId === 'validity' && <p className="helper">Isi berdasarkan pengujian yang sudah dilakukan. Koefisien reliabilitas tidak mengisi hasil uji validitas.</p>}
        {['figures', 'tables'].includes(sectionId) && <p className="helper">Masukkan satu entri per baris. Tambahkan nomor halaman setelah tata letak Word selesai.</p>}
        <textarea aria-label={title} rows={12} lang={code} dir={rtl ? 'rtl' : 'auto'} value={text}
          onChange={event => onSectionChange(sectionId, event.target.value)}
          placeholder="Ketik isi atau tempel tabel Markdown." />
        <div className="action-row">
          {template && <button className="secondary-btn" onClick={() => replace(template)}>Pakai templat Indonesia</button>}
          {['scores', 'descriptive', 'calculations'].includes(sectionId) &&
            <button className="secondary-btn" onClick={importData}>Ambil dari Analisis kuantitatif</button>}
        </div>
      </>}
      {sectionId === 'instrument' && <>
        <p className="helper">{text.trim() ? 'Lampiran memakai instrumen yang tersimpan pada proyek ini.' : 'Isi instrumen melalui editor Instrumen.'}</p>
        <button className="secondary-btn" onClick={openInstrument}>Buka editor instrumen</button>
      </>}
      {index && <p className="helper">Pada Word naskah lengkap, klik kanan daftar lalu pilih Perbarui Bidang untuk mengisi nomor halaman. Unduhan terpisah berisi daftar judul.</p>}
      {sectionId === 'bibliography' && <p className="helper">{refs.length} sumber manual atau terverifikasi dari menu Referensi.</p>}
      {message && <p role="status">{message}</p>}
      <div className="action-row">
        <button className="secondary-btn" disabled={busy || !exportable} onClick={() => onExport(kind)}><Download size={15} /> Unduh bagian ini</button>
      </div>
    </section>
  );
}

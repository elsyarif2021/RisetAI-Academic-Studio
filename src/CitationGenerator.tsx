import { useId, useRef, useState } from 'react';
import { Quote, X } from 'lucide-react';
import './citation-generator.css';

export default function CitationGenerator() {
  return <iframe
    className="citation-generator-frame"
    title="Alat Generator Sitasi"
    src={import.meta.env.BASE_URL + 'generator-sitasi/index.html'}
    allow="clipboard-write"
  />;
}

export function CitationGeneratorButton() {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  return <>
    <button type="button" className="secondary-btn" onClick={() => {
      dialog.current?.showModal();
      setOpen(true);
    }}>
      <Quote size={16} aria-hidden="true"/> Generator Sitasi
    </button>
    <dialog ref={dialog} className="citation-generator-dialog" aria-labelledby={titleId} onClose={() => setOpen(false)}>
      <header className="citation-generator-heading">
        <h2 id={titleId}>Generator Sitasi</h2>
        <button type="button" className="secondary-btn" aria-label="Tutup Generator Sitasi" onClick={() => dialog.current?.close()}>
          <X size={18} aria-hidden="true"/>
        </button>
      </header>
      {open && <CitationGenerator/>}
    </dialog>
  </>;
}

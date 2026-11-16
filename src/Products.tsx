import { ArrowLeft, ExternalLink, Calculator } from 'lucide-react';

const products = [
  {
    name: 'Math 11 Smart — Matematika Kelas XI',
    category: 'Pembelajaran dan kursus',
    description: 'Materi Matematika Kelas XI semester 1–2, contoh soal beserta pembahasan, latihan interaktif, kalkulator rumus, dan penerapan matematika dalam kehidupan sehari-hari.',
    url: 'https://math-11-smart.vercel.app/',
  },
];

export default function Products({ onBack }: { onBack: () => void }) {
  return <section className="portfolio-body" aria-label="Katalog produk">
    <div className="portfolio-title">
      <div>
        <h1>Produk</h1>
        <p>Pembelajaran dan kursus — buka aplikasi secara langsung.</p>
      </div>
      <button className="secondary-btn" type="button" onClick={onBack}><ArrowLeft size={16}/> Kembali</button>
    </div>
    <div className="portfolio-list">
      {products.map(product => <article className="project-card" key={product.url}>
        <Calculator size={24} aria-hidden="true"/>
        <span>
          <strong>{product.name}</strong>
          <small>{product.category}</small>
          <p>{product.description}</p>
          <a href={product.url} target="_blank" rel="noopener noreferrer" className="primary-btn" style={{ display: 'inline-flex', marginTop: 12 }}>
            Buka aplikasi <ExternalLink size={16}/>
          </a>
        </span>
      </article>)}
    </div>
  </section>;
}

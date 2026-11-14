import { useMemo, useState } from 'react';
import { analyzeScores, methods, parseScores, type QuantMethod } from '../shared/quant.mjs';
import type { QuantitativeData } from '../shared/project.mjs';

type Props = {
  data: QuantitativeData;
  onChange: (data: QuantitativeData) => void;
  toChapter: (text: string) => void;
};

export default function Quantitative({ data, onChange, toChapter }: Props) {
  const [error, setError] = useState('');
  const headers = useMemo(() => {
    try {
      return parseScores(data.scores).headers;
    } catch {
      return [];
    }
  }, [data.scores]);
  const method = methods[data.method];
  const pairedColumns = data.method === 'pearson' || data.method === 'paired';

  function calculate() {
    setError('');
    try {
      const result = analyzeScores(data.scores, data.method, data.first, data.second, data.threshold);
      onChange({ ...data, result });
    } catch (problem) {
      onChange({ ...data, result: '' });
      setError(problem instanceof Error ? problem.message : 'Perhitungan gagal.');
    }
  }

  return (
    <section className="panel">
      <h2>Analisis kuantitatif</h2>
      <p>Tempel skor dari Excel atau kuesioner. Baris pertama berisi nama kolom. Setiap baris berikutnya mewakili satu responden. Gunakan skor total variabel untuk korelasi atau skor per butir untuk reliabilitas.</p>
      <label className="field-label" htmlFor="quant-scores">Skor kuesioner</label>
      <textarea id="quant-scores" rows={7} value={data.scores} placeholder={'Butir1;Butir2;Butir3\n4;3;5\n2;3;2\n5;4;5'}
        onChange={event => { setError(''); onChange({ ...data, scores: event.target.value, result: '' }); }} />
      <div className="form-grid">
        <div>
          <label className="field-label" htmlFor="quant-test">Metode dan rumus</label>
          <select id="quant-test" value={data.method} onChange={event => {
            setError('');
            onChange({ ...data, method: event.target.value as QuantMethod, result: '' });
          }}>
            {Object.entries(methods).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
          </select>
        </div>
        {pairedColumns && <div>
          <label className="field-label" htmlFor="quant-alpha">Taraf signifikansi</label>
          <select id="quant-alpha" value={data.threshold} onChange={event => onChange({ ...data, threshold: Number(event.target.value), result: '' })}>
            <option value={0.05}>0,05</option><option value={0.01}>0,01</option><option value={0.1}>0,10</option>
          </select>
        </div>}
      </div>
      {pairedColumns && <div className="form-grid">
        {(['first', 'second'] as const).map((key, index) => <div key={key}>
          <label className="field-label" htmlFor={'quant-' + key}>Kolom {index + 1}</label>
          <select id={'quant-' + key} value={headers[data[key]] ? data[key] : ''} onChange={event => onChange({ ...data, [key]: Number(event.target.value), result: '' })}>
            <option value="" disabled>Pilih kolom</option>
            {headers.map((header, position) => <option key={header} value={position}>{header}</option>)}
          </select>
        </div>)}
      </div>}
      <div className="target-box"><div><b>{method.formula}</b><small>{method.note}</small></div></div>
      <div className="action-row"><button type="button" className="primary-btn" onClick={calculate}>Hitung hasil</button></div>
      {error && <p role="alert" className="portfolio-error">{error}</p>}
      {data.result && <div className="target-box">
        <div><b>Hasil {method.label}</b></div>
        <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{data.result}</p>
        <button type="button" className="secondary-btn" onClick={() => toChapter('### ' + method.label + '\n\n' + data.result)}>Masukkan hasil ke BAB IV</button>
      </div>}
      <div className="subhead"><h3>Hasil analisis dari aplikasi lain</h3><p>Tempel hasil dari Excel, SPSS, atau analisis mandiri. Sertakan nama uji, variabel, jumlah responden, dan hasil yang dilaporkan.</p></div>
      <label className="field-label" htmlFor="quant-external">Hasil analisis yang sudah tersedia</label>
      <textarea id="quant-external" rows={5} value={data.external} onChange={event => onChange({ ...data, external: event.target.value })} />
      <button type="button" className="secondary-btn" disabled={!data.external.trim()} onClick={() => toChapter('### Hasil analisis yang dilaporkan\n\n' + data.external.trim())}>Masukkan laporan ke BAB IV</button>
    </section>
  );
}

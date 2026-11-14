const number = value => {
  const text = value.trim();
  if (!/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(text)) return NaN;
  return Number(text.replace(',', '.'));
};

export function parseScores(text) {
  const lines = text.trim().split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 3 || lines.length > 1001) throw new Error('Masukkan satu baris nama kolom dan 2–1.000 responden.');
  const separator = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(separator).map(value => value.trim());
  if (headers.length > 50 || headers.some(value => !value) || new Set(headers).size !== headers.length) {
    throw new Error('Gunakan 1–50 nama kolom yang unik dan terisi.');
  }
  return {
    headers,
    rows: lines.slice(1).map((line, index) => {
      const values = line.split(separator).map(number);
      if (values.length !== headers.length || values.some(value => !Number.isFinite(value) || Math.abs(value) > 1e9)) {
        throw new Error(`Baris data ${index + 1} harus berisi skor angka lengkap. Gunakan tab atau titik koma jika desimal memakai koma.`);
      }
      return values;
    }),
  };
}

const sum = values => values.reduce((total, value) => total + value, 0);
const mean = values => sum(values) / values.length;
const ss = (values, center = mean(values)) => sum(values.map(value => (value - center) ** 2));
const variance = values => ss(values) / (values.length - 1);

// Integrate the Student t density after t = sqrt(df) * tan(theta).
function twoSidedP(t, df) {
  const lower = Math.atan(Math.abs(t) / Math.sqrt(df));
  const upper = Math.PI / 2;
  const integrate = start => {
    const segments = 1024;
    const step = (upper - start) / segments;
    let total = 0;
    for (let i = 0; i <= segments; i++) {
      const weight = i === 0 || i === segments ? 1 : i % 2 ? 4 : 2;
      total += weight * Math.cos(start + i * step) ** (df - 1);
    }
    return total * step / 3;
  };
  return integrate(lower) / integrate(0);
}

export const methods = {
  descriptive: { label: 'Statistik deskriptif', formula: 'x̄ = Σx/n; s = √[Σ(x−x̄)²/(n−1)]', note: 'Merangkum skor tiap variabel atau butir. Simpangan baku memakai rumus sampel.' },
  pearson: { label: 'Korelasi Pearson', formula: 'r = Σ[(x−x̄)(y−ȳ)]/√[Σ(x−x̄)² Σ(y−ȳ)²]; t = r√[(n−2)/(1−r²)]', note: 'Pakai kolom skor total X dan Y. Periksa hubungan linear, pencilan, dan independensi antarresponden sebelum menafsirkan p.' },
  paired: { label: 'Uji t berpasangan', formula: 'd = X−Y; t = d̄/(s_d/√n); df = n−1', note: 'Pakai dua pengukuran dari orang yang sama pada baris yang sama. Periksa normalitas selisih dan independensi antar pasangan.' },
  alpha: { label: 'Reliabilitas Cronbach', formula: 'α = k/(k−1) × (1 − Σsᵢ²/s_total²)', note: 'Masukkan hanya butir dari satu skala. Balik skor butir negatif sebelum menghitung. Alpha mengukur konsistensi internal, bukan validitas.' },
};

export function analyzeScores(text, method, first, second, threshold) {
  const { rows, headers } = parseScores(text);
  const n = rows.length;
  const columns = headers.map((_, index) => rows.map(row => row[index]));
  const decimals = value => value.toLocaleString('id-ID', { maximumFractionDigits: 4 });
  const label = value => value.replace(/[|\r\n]/g, ' ');
  if (method === 'descriptive') {
    return [
      `Jumlah responden: ${n}`,
      '| Kolom | Rata-rata | SD sampel | Minimum | Maksimum |',
      '| --- | --- | --- | --- | --- |',
      ...columns.map((values, index) =>
        `| ${label(headers[index])} | ${decimals(mean(values))} | ${decimals(Math.sqrt(variance(values)))} | ${decimals(Math.min(...values))} | ${decimals(Math.max(...values))} |`),
    ].join('\n');
  }
  if (method === 'alpha') {
    const k = headers.length;
    if (k < 2) throw new Error('Cronbach memerlukan minimal dua kolom butir.');
    const totalVariance = variance(rows.map(sum));
    if (totalVariance === 0) throw new Error('Skor total konstan. Alpha tidak dapat dihitung.');
    const alpha = (k / (k - 1)) * (1 - sum(columns.map(variance)) / totalVariance);
    return `Responden: ${n}; butir: ${k}\nAlpha Cronbach: ${decimals(alpha)}\n${methods.alpha.note}`;
  }

  const x = columns[first];
  const y = columns[second];
  if (!x || !y || first === second) throw new Error('Pilih dua kolom yang berbeda.');
  if (n < 3) throw new Error('Gunakan minimal tiga responden untuk pengujian ini.');
  let statistic, t, df;
  if (method === 'pearson') {
    const xMean = mean(x), yMean = mean(y);
    const denominator = Math.sqrt(ss(x) * ss(y));
    if (!denominator) throw new Error('Korelasi tidak dapat dihitung karena ada kolom dengan skor konstan.');
    const r = Math.max(-1, Math.min(1, sum(x.map((value, i) => (value - xMean) * (y[i] - yMean))) / denominator));
    df = n - 2;
    t = Math.abs(r) >= 1 ? Math.sign(r) * Infinity : r * Math.sqrt(df / (1 - r ** 2));
    statistic = `r Pearson: ${decimals(r)}`;
  } else {
    const differences = x.map((value, index) => value - y[index]);
    const sd = Math.sqrt(variance(differences));
    if (!sd) throw new Error('Selisih semua pasangan sama. Uji t tidak dapat dihitung.');
    t = mean(differences) / (sd / Math.sqrt(n));
    df = n - 1;
    statistic = `Rata-rata selisih: ${decimals(mean(differences))}`;
  }
  const p = twoSidedP(t, df);
  return [
    `Kolom: ${label(headers[first])} dan ${label(headers[second])}; responden: ${n}`,
    statistic,
    `t = ${decimals(t)}, df = ${df}, p dua sisi ${p < 0.0001 ? '< 0,0001' : '= ' + decimals(p)}`,
    `Pada α = ${decimals(threshold)}: ${p < threshold ? 'tolak H₀' : 'gagal menolak H₀'}.`,
    methods[method].note,
  ].join('\n');
}

'use strict';

const formats = {
  apa: 'APA 7', mla: 'MLA 9', notes: 'Chicago Notes', chicago: 'Chicago Author-Date',
  harvard: 'Harvard', ieee: 'IEEE', vancouver: 'Vancouver'
};
const kinds = { 'article-journal': 'Artikel jurnal', book: 'Buku', chapter: 'Bab buku', webpage: 'Situs web' };
const fieldSpecs = [
  ['title', 'Judul sumber', null, 'all', true],
  ['author', 'Penulis', 'Satu per baris: Nama keluarga, Nama depan. Gunakan org: Nama untuk lembaga.', 'all', true],
  ['editor', 'Editor', 'Gunakan format nama yang sama seperti penulis.', 'book chapter', true],
  ['year', 'Tahun terbit', null, 'all'],
  ['date', 'Tanggal publikasi', 'Opsional, MM atau MM-DD.', 'webpage'],
  ['container-title', 'Nama jurnal / buku / situs', null, 'article-journal chapter webpage', true],
  ['journalAbbreviation', 'Singkatan jurnal', 'Jika tercatat di publikasi.', 'article-journal', true],
  ['volume', 'Volume', null, 'article-journal book chapter'],
  ['issue', 'Nomor edisi jurnal', null, 'article-journal'],
  ['page', 'Rentang halaman / nomor artikel', null, 'article-journal chapter'],
  ['publisher', 'Penerbit', null, 'book chapter webpage'],
  ['publisher-place', 'Kota terbit', null, 'book chapter'],
  ['edition', 'Edisi buku', null, 'book chapter'],
  ['accessed', 'Tanggal akses', 'Opsional, YYYY-MM-DD.', 'webpage'],
  ['DOI', 'DOI', null, 'all'],
  ['URL', 'Tautan sumber', null, 'all']
];

const el = id => document.getElementById(id);
const styles = el('styles');
const fields = el('fields');
const editor = el('editor');
const query = el('query');
const matches = el('matches');
const locator = el('locator');
const resourceCache = new Map();
const allowedTags = new Set(['I','EM','B','STRONG','SPAN','SUP','SUB','A','DIV','BR','SMALL']);
let activeStyle = 'apa';
let current = null;
let extras = {};
let request = null;
let formatVersion = 0;

function make(tag, className, value) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (value !== undefined) element.textContent = value;
  return element;
}

function setStatus(id, message = '', error = false) {
  el(id).textContent = message;
  el(id).classList.toggle('error', error);
}

function safeURL(value) {
  try {
    const url = new URL(value);
    if (['http:', 'https:'].includes(url.protocol)) return url.href;
  } catch {}
  return '';
}

function metadataText(value) {
  const template = document.createElement('template');
  template.innerHTML = String(value ?? '');
  return template.content.textContent.trim();
}

function safeCitation(html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  for (const node of [...template.content.querySelectorAll('*')]) {
    if (!allowedTags.has(node.tagName)) {
      node.replaceWith(document.createTextNode(node.textContent));
      continue;
    }
    const url = node.tagName === 'A' ? safeURL(node.getAttribute('href')) : '';
    const classes = [...node.classList].filter(name => ['csl-entry','csl-bib-body','csl-left-margin','csl-right-inline'].includes(name));
    const styles = [...node.style].filter(key => ['font-style','font-weight','font-variant','text-decoration','vertical-align'].includes(key));
    const properties = styles.map(key => [key,node.style.getPropertyValue(key)]);
    for (const attr of [...node.attributes]) node.removeAttribute(attr.name);
    if (classes.length) node.className = classes.join(' ');
    for (const [key,value] of properties) node.style.setProperty(key,value);
    if (url) {
      node.href = url;
      node.target = '_blank';
      node.rel = 'noopener noreferrer';
    }
  }
  return template.innerHTML.trim();
}

function getDOI(value) {
  let identifier = value.trim().replace(/^doi:\s*/i, '');
  if (/^https?:\/\/(?:dx\.)?doi\.org\//i.test(identifier)) {
    try { identifier = decodeURIComponent(new URL(identifier).pathname.slice(1)); } catch { return ''; }
  }
  return /^10\.\d{4,}(?:\.\d+)*\/\S+$/i.test(identifier) ? identifier : '';
}

function formatNames(list = []) {
  return list.map(name => {
    if (name.literal) return 'org: ' + name.literal;
    return [name.family, name.given || '', name.suffix].filter((part, index) => part || index < 2).join(', ').replace(/, $/, '');
  }).join('\n');
}

function readNames(value) {
  return value.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
    if (/^org:\s*/i.test(line)) return {literal: line.replace(/^org:\s*/i, '')};
    const [family, given, ...suffix] = line.split(',').map(part => part.trim());
    return Object.fromEntries(Object.entries({family, given, suffix: suffix.join(', ')}).filter(([, value]) => value));
  });
}

function crossrefItem(record) {
  const mapNames = names => (names || []).map(person => person.name
    ? {literal: metadataText(person.name)}
    : {family: metadataText(person.family), given: metadataText(person.given), suffix: metadataText(person.suffix)});
  const published = (record.published || record.issued || record['published-print'] || record['published-online'])?.['date-parts']?.[0] || [];
  const type = record.type === 'journal-article' ? 'article-journal'
    : ['book-chapter','book-section','book-part','reference-entry'].includes(record.type) ? 'chapter'
    : ['book','edited-book','monograph','reference-book'].includes(record.type) ? 'book' : record.type;
  const supported = Object.hasOwn(kinds, type);
  const item = {
    type: supported ? type : '',
    title: metadataText(record.title?.[0]),
    author: mapNames(record.author),
    editor: mapNames(record.editor),
    year: published[0] || '',
    date: published.slice(1).map(part => String(part).padStart(2, '0')).join('-'),
    'container-title': metadataText(record['container-title']?.[0]),
    journalAbbreviation: metadataText(record['short-container-title']?.[0]),
    volume: record.volume || '',
    issue: record.issue || '',
    page: record.page || record['article-number'] || '',
    publisher: metadataText(record.publisher),
    'publisher-place': metadataText(record['publisher-location']),
    edition: metadataText(record['edition-number']),
    URL: record.URL || '',
    DOI: record.DOI || ''
  };
  return {item, supported, language: record.language};
}

function drawFields(item = {}) {
  fields.replaceChildren();
  const typeLabel = make('label', 'wide', 'Jenis sumber');
  const select = make('select');
  select.name = 'type';
  select.required = true;
  select.add(new Option('Pilih jenis sumber', ''));
  for (const [value, label] of Object.entries(kinds)) select.add(new Option(label, value));
  select.value = item.type ?? 'article-journal';
  typeLabel.append(select);
  fields.append(typeLabel);
  for (const [name,label,hint,types,wide] of fieldSpecs) {
    const wrapper = make('label', wide ? 'wide' : '', label);
    wrapper.dataset.types = types;
    if (hint) wrapper.append(make('small', '', ' · ' + hint));
    const input = make(['author','editor'].includes(name) ? 'textarea' : 'input');
    input.name = name;
    input.maxLength = ['author','editor'].includes(name) ? 12000 : 1000;
    input.required = name === 'title';
    if (name === 'year') input.pattern = '[0-9]{4}';
    if (name === 'date') input.pattern = '(0[1-9]|1[0-2])(-([0-2][0-9]|3[01]))?';
    if (name === 'accessed') input.pattern = '[0-9]{4}-(0[1-9]|1[0-2])-([0-2][0-9]|3[01])';
    input.value = Array.isArray(item[name]) ? formatNames(item[name]) : item[name] || '';
    wrapper.append(input);
    fields.append(wrapper);
  }
  function toggleFields() {
    for (const wrapper of fields.querySelectorAll('[data-types]')) {
      wrapper.hidden = !wrapper.dataset.types.split(' ').some(type => type === 'all' || type === select.value);
      wrapper.querySelector('input,textarea').disabled = wrapper.hidden;
    }
  }
  select.addEventListener('change', toggleFields);
  toggleFields();
  editor.hidden = false;
}

function readEditor() {
  const item = Object.fromEntries([...new FormData(editor)].map(([name, value]) => [name, value.trim()]).filter(([,value]) => value));
  if (!item.title || !item.type) throw new Error('Masukkan judul dan pilih jenis sumber.');
  if (item.URL && !safeURL(item.URL)) throw new Error('Tautan sumber harus diawali https:// atau http://.');
  if (item.DOI && !getDOI(item.DOI)) throw new Error('Periksa format DOI.');
  if (item.DOI) item.DOI = getDOI(item.DOI);
  if (item.author) item.author = readNames(item.author);
  if (item.editor) item.editor = readNames(item.editor);
  if (item.year) item.issued = {'date-parts': [[Number(item.year), ...(item.date || extras.date || '').split('-').filter(Boolean).map(Number)]]};
  if (item.accessed) item.accessed = {'date-parts': [item.accessed.split('-').map(Number)]};
  delete item.year;
  delete item.date;
  return {id: 'source', ...(extras.language ? {language: extras.language} : {}), ...item};
}

function fetchAsset(name) {
  if (!resourceCache.has(name)) {
    const resource = fetch('assets/' + name).then(async response => {
      if (!response.ok) throw new Error();
      return response.text();
    }).catch(error => {
      resourceCache.delete(name);
      throw error;
    });
    resourceCache.set(name, resource);
  }
  return resourceCache.get(name);
}

function cite(engine, item, noteIndex = 0, properties = {}) {
  const citation = {citationID: 'preview-' + noteIndex, citationItems:[{id:item.id,...properties}], properties:{noteIndex}};
  return engine.previewCitationCluster(citation, [], [], 'html');
}

async function renderCitation(key, item, pages) {
  const [style,locale] = await Promise.all([fetchAsset(key + '.csl'),fetchAsset('en-US.xml')]);
  const engine = new CSL.Engine({retrieveLocale: () => locale, retrieveItem: () => structuredClone(item)}, style, 'en-US');
  engine.setOutputFormat('html');
  engine.updateItems([item.id]);
  const bibliography = engine.makeBibliography();
  if (!bibliography?.[1]?.length) throw new Error('Bibliography unavailable');
  const rows = [['Daftar pustaka', bibliography[1].join('')]];
  const properties = pages ? {locator: pages, label: 'page'} : {};
  if (key === 'notes') {
    rows.push(['Catatan kaki pertama', cite(engine, item, 1, properties)]);
    engine.processCitationCluster(
      {citationID: 'first', citationItems: [{id: item.id, ...properties}], properties: {noteIndex: 1}}, [], []
    );
    const shortened = engine.previewCitationCluster(
      {citationID: 'shortened', citationItems: [{id: item.id, ...properties}], properties: {noteIndex: 3}}, [['first', 1]], [], 'html'
    );
    if (shortened) rows.push(['Catatan kaki pendek', shortened]);
  } else if (key === 'ieee' || key === 'vancouver') {
    rows.push(['Sitasi bernomor', cite(engine, item)]);
    if (pages && key === 'ieee') rows.push(['Sitasi dengan halaman', cite(engine, item, 0, properties)]);
  } else {
    rows.push(['Sitasi parentetik', cite(engine, item)]);
    if (item.author?.length || item.editor?.length) {
      const narrative = engine.processCitationCluster(
        {citationID:'narrative',citationItems:[{id:item.id}],properties:{noteIndex:0,mode:'composite'}}, [], []
      )[1][0]?.[1];
      if (narrative) rows.push(['Sitasi naratif', narrative]);
    }
    if (pages) rows.push(['Sitasi dengan halaman', cite(engine, item, 0, properties)]);
  }
  return rows.map(([title, html]) => [title,safeCitation(html)]);
}

async function copyRich(container, button) {
  const plain = container.textContent.replace(/\s+/g, ' ').trim();
  try {
    if (!window.ClipboardItem || !navigator.clipboard?.write) throw new Error();
    await navigator.clipboard.write([new ClipboardItem({
      'text/html': new Blob([container.innerHTML], {type:'text/html'}),
      'text/plain': new Blob([plain], {type:'text/plain'})
    })]);
    button.textContent = 'Tersalin';
  } catch {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(container);
    selection.removeAllRanges();
    selection.addRange(range);
    let success = false;
    try { success = document.execCommand('copy'); } catch {}
    if (success) {
      selection.removeAllRanges();
      button.textContent = 'Tersalin';
    } else {
      button.textContent = 'Teks dipilih';
    }
  }
  setTimeout(() => { button.textContent = 'Salin'; }, 1800);
}

function output(title, html) {
  const box = make('article', 'out');
  const head = make('div', 'out-head');
  const copy = make('button', 'link', 'Salin');
  copy.type = 'button';
  copy.setAttribute('aria-label', 'Salin ' + title);
  const content = make('div', 'citation-text');
  content.innerHTML = html;
  copy.addEventListener('click', () => copyRich(content, copy));
  head.append(make('h3', '', title), copy);
  box.append(head, content);
  return box;
}

async function render() {
  const version = ++formatVersion;
  if (!current) return;
  const item = current;
  const compare = !el('compare').hidden;
  el('empty').hidden = true;
  el('rendered').hidden = true;
  if (compare) el('comparison').replaceChildren();
  setStatus('format-status', 'Memformat sitasi…');
  try {
    const rows = await renderCitation(activeStyle,item,locator.value.trim());
    if (version !== formatVersion) return;
    el('outputs').replaceChildren(...rows.map(([title,html]) => output(title,html)));
    locator.closest('.citation-settings').hidden = activeStyle === 'vancouver';
    el('numbered-hint').hidden = !['ieee','vancouver'].includes(activeStyle);
    el('rendered').hidden = false;
    setStatus('format-status');
    if (compare) {
      const results = await Promise.allSettled(Object.keys(formats).map(key => renderCitation(key,item,'')));
      if (version !== formatVersion) return;
      el('comparison').replaceChildren(...results.map((result,index) => {
        const label = Object.values(formats)[index];
        return result.status === 'fulfilled' ? output(label,result.value[0][1]) : make('p', 'status error', label + ' belum dapat diformat.');
      }));
    }
  } catch {
    if (version !== formatVersion) return;
    setStatus('format-status', 'Format belum dapat dimuat. Coba tekan Format sitasi kembali.', true);
  }
}

function resetResult() {
  current = null;
  formatVersion++;
  el('rendered').hidden = true;
  el('empty').hidden = false;
  el('compare').hidden = true;
  el('compare-toggle').setAttribute('aria-expanded','false');
  el('compare-toggle').textContent = 'Bandingkan semua format';
  locator.value = '';
  setStatus('format-status');
}

function stopLookup() {
  request?.abort();
  request = null;
  el('search-btn').disabled = false;
  matches.hidden = true;
  matches.replaceChildren();
  setStatus('search-status');
}

function loadRecord(record, origin) {
  const {item,supported,language} = crossrefItem(record);
  extras = {language, date: item.type === 'webpage' ? '' : item.date};
  drawFields(item);
  el('origin').textContent = origin;
  if (supported && item.title) {
    current = readEditor();
    render();
  } else {
    setStatus('search-status','Periksa judul dan pilih jenis sumber yang paling sesuai sebelum memformat.');
  }
}

async function search(event) {
  event.preventDefault();
  stopLookup();
  resetResult();
  editor.hidden = true;
  const value = query.value.trim();
  if (!value) return;
  const doi = getDOI(value);
  if (!doi && /^(?:https?:\/\/|doi:|10\.\d+\/)/i.test(value)) {
    setStatus('search-status','Masukkan DOI atau judul. Untuk menyitasi alamat situs web, pilih Isi manual.',true);
    return;
  }
  const controller = new AbortController();
  request = controller;
  el('search-btn').disabled = true;
  setStatus('search-status','Mengambil metadata Crossref…');
  const timeout = setTimeout(() => controller.abort(),12000);
  const route = doi ? '/' + encodeURIComponent(doi) : '?' + new URLSearchParams({'query.title':value,rows:'6'});
  try {
    const response = await fetch('https://api.crossref.org/works' + route,{signal:controller.signal});
    if (request !== controller) return;
    if (response.status === 404) {
      setStatus('search-status','DOI tidak ditemukan di Crossref. Periksa DOI atau isi detail secara manual.',true);
      return;
    }
    if (response.status === 429) throw new Error('Crossref sedang membatasi permintaan. Coba lagi sebentar atau isi manual.');
    if (!response.ok) throw new Error('Crossref belum dapat diakses. Coba lagi atau isi manual.');
    const {message} = await response.json();
    if (request !== controller) return;
    if (doi) {
      setStatus('search-status','Metadata ditemukan. Periksa detail sebelum menyalin.');
      loadRecord(message,'Metadata Crossref');
      return;
    }
    const records = message.items.filter(item => metadataText(item.title?.[0]));
    if (!records.length) {
      setStatus('search-status','Judul belum ditemukan. Ubah kata kunci atau isi manual.',true);
      return;
    }
    setStatus('search-status','Pilih catatan yang sesuai dengan sumber Anda.');
    for (const record of records) {
      const {item} = crossrefItem(record);
      const button = make('button','match');
      button.type = 'button';
      button.append(make('b','',item.title),make('small','',[
        item.author?.[0]?.family || item.author?.[0]?.literal, item.year,item['container-title'],item.DOI
      ].filter(Boolean).join(' · ')));
      button.addEventListener('click', () => {
        matches.hidden = true;
        setStatus('search-status','Catatan dipilih. Periksa detail sebelum menyalin.');
        loadRecord(record,'Metadata Crossref');
        editor.elements.type.focus();
      });
      matches.append(button);
    }
    matches.hidden = false;
  } catch (error) {
    if (request === controller) {
      const message = error.name === 'AbortError' ? 'Crossref belum merespons. Coba lagi atau isi manual.'
        : error instanceof TypeError ? 'Sambungan ke Crossref gagal. Periksa koneksi atau isi manual.' : error.message;
      setStatus('search-status',message,true);
    }
  } finally {
    clearTimeout(timeout);
    if (request === controller) {
      request = null;
      el('search-btn').disabled = false;
    }
  }
}

for (const [key,name] of Object.entries(formats)) {
  const button = make('button','style',name);
  button.type = 'button';
  button.dataset.style = key;
  button.setAttribute('aria-pressed',String(key === activeStyle));
  button.addEventListener('click', () => {
    activeStyle = key;
    for (const other of styles.children) other.setAttribute('aria-pressed',String(other === button));
    el('active-style').textContent = name;
    render();
  });
  styles.append(button);
}
el('active-style').textContent = formats[activeStyle];
el('search-form').addEventListener('submit',search);
el('manual').addEventListener('click', () => {
  stopLookup();
  resetResult();
  extras = {};
  drawFields();
  el('origin').textContent = 'Input manual';
  editor.elements.namedItem('title').focus();
});
el('sample').addEventListener('click', async () => {
  stopLookup();
  resetResult();
  editor.hidden = true;
  const controller = new AbortController();
  request = controller;
  try {
    const response = await fetch('assets/sample.json',{signal:controller.signal});
    if (!response.ok) throw new Error();
    const record = await response.json();
    if (request !== controller) return;
    query.value = record.DOI;
    setStatus('search-status','Contoh artikel nyata dari arsip metadata Crossref.');
    loadRecord(record,'Contoh Crossref');
  } catch {
    if (request === controller) setStatus('search-status','Contoh belum dapat dimuat. Coba lagi.',true);
  } finally {
    if (request === controller) request = null;
  }
});
el('clear').addEventListener('click', () => {
  stopLookup();
  resetResult();
  editor.hidden = true;
  query.value = '';
  query.focus();
});
editor.addEventListener('input', () => {
  if (el('origin').textContent.includes('Crossref')) el('origin').textContent = 'Crossref · disunting';
});
editor.addEventListener('submit', event => {
  event.preventDefault();
  try {
    current = readEditor();
    render();
  } catch (error) {
    setStatus('format-status',error.message,true);
  }
});
locator.addEventListener('change',render);
el('compare-toggle').addEventListener('click', event => {
  const compare = el('compare');
  compare.hidden = !compare.hidden;
  event.currentTarget.setAttribute('aria-expanded',String(!compare.hidden));
  event.currentTarget.textContent = compare.hidden ? 'Bandingkan semua format' : 'Tutup perbandingan format';
  render();
});

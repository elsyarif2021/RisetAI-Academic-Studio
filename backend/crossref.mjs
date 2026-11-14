export async function searchCrossref(query) {
  const url = new URL('https://api.crossref.org/works');
  url.search = new URLSearchParams({
    'query.bibliographic': query,
    rows: '10',
    select: 'DOI,title,author,published,publisher,container-title',
  });
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'RisetAI Academic Studio (reference search)' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error('Crossref search failed');
  const { message } = await response.json();
  if (!Array.isArray(message?.items)) throw new Error('Invalid Crossref response');
  return message.items.flatMap(item => {
    const title = item.title?.find(value => typeof value === 'string' && value.trim());
    const doi = item.DOI;
    if (!title || typeof doi !== 'string' || !/^10\.\d+\/\S+$/.test(doi)) return [];
    const authors = (item.author || [])
      .map(author => author.name || [author.given, author.family].filter(Boolean).join(' '))
      .filter(Boolean)
      .join(', ');
    const year = item.published?.['date-parts']?.[0]?.[0];
    return [{
      id: 'crossref-' + doi,
      title,
      authors,
      year: Number.isInteger(year) ? String(year) : '',
      publisher: item['container-title']?.[0] || item.publisher || '',
      url: 'https://doi.org/' + doi.split('/').map(encodeURIComponent).join('/'),
      snippet: '',
      source: 'Crossref',
    }];
  });
}

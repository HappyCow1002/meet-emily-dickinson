(function () {
  'use strict';

  const PAGE_SIZE = 40;
  const SOURCE_HOSTS = new Set(['en.wikisource.org', 'www.gutenberg.org', 'gutenberg.org']);
  const normalize = value => String(value ?? '').normalize('NFKC')
    .replace(/[\u2018\u2019\u02bc\uff07]/g, "'").toLocaleLowerCase('en-US').replace(/\s+/g, ' ').trim();

  function sourceURL(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && SOURCE_HOSTS.has(url.hostname) && !url.username && !url.password && !url.port
        ? url.href : null;
    } catch { return null; }
  }

  window.createEmilyLibrary = function createEmilyLibrary({ poems, onChoose, onRead, current = () => 0 }) {
    if (!Array.isArray(poems)) throw new TypeError('The poem library needs an array of poems.');
    const search = document.getElementById('poemSearch');
    const count = document.getElementById('poemCount');
    const more = document.getElementById('poemMoreBtn');
    const grid = document.getElementById('poemGrid');
    if (!search || !count || !more || !grid) throw new Error('The poem library controls are missing.');

    const entries = poems.map((poem, index) => ({
      poem, index,
      searchText: normalize([poem.title, poem.short, poem.section, poem.mood,
        ...(Array.isArray(poem.lines) ? poem.lines : [])].join('\n')),
    }));
    let matches = entries, limit = PAGE_SIZE, rendered = [];

    function refreshSelection() {
      const selected = current();
      for (const { index, button, card } of rendered) {
        button.classList.toggle('selected', index === selected);
        card.classList.toggle('selected', index === selected);
        button.setAttribute('aria-pressed', String(index === selected));
      }
    }

    function makeCard({ poem, index }) {
      const title = String(poem.title || poem.short || 'Untitled poem');
      const card = document.createElement('article');
      card.className = 'poem-card';
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'poem-tile';
      button.dataset.action = 'choose'; button.dataset.idx = String(index); button.dataset.poem = String(poem.id ?? index);
      const heading = document.createElement('strong'); heading.textContent = title;
      button.append(heading);
      const section = poem.section || poem.mood;
      if (section) {
        const label = document.createElement('span'); label.className = 'poem-section'; label.textContent = String(section);
        button.append(label);
      }
      const actions = document.createElement('div'); actions.className = 'poem-card-actions';
      const read = document.createElement('button');
      read.type = 'button'; read.className = 'poem-read'; read.textContent = 'Hear poem';
      read.dataset.action = 'read'; read.dataset.idx = String(index); read.disabled = typeof onRead !== 'function';
      read.setAttribute('aria-label', `Hear ${title}`); actions.append(read);
      const href = sourceURL(poem.source);
      if (href) {
        const source = document.createElement('a');
        source.className = 'poem-source'; source.href = href; source.target = '_blank'; source.rel = 'noopener noreferrer';
        source.textContent = 'Source text ↗'; source.setAttribute('aria-label', `Source text for ${title} (opens in a new tab)`);
        actions.append(source);
      }
      card.append(button, actions);
      return { index, button, card };
    }

    function render() {
      rendered = matches.slice(0, limit).map(makeCard);
      if (rendered.length) grid.replaceChildren(...rendered.map(item => item.card));
      else {
        const empty = document.createElement('p'); empty.className = 'poem-empty';
        empty.textContent = 'No poems match your search. Try a title, section, or a line.';
        grid.replaceChildren(empty);
      }
      const total = matches.length, noun = total === 1 ? 'poem' : 'poems';
      count.textContent = normalize(search.value)
        ? `${total} matching ${noun}. Showing ${rendered.length}.`
        : `Showing ${rendered.length} of ${total} ${noun}.`;
      more.hidden = rendered.length >= total;
      more.disabled = more.hidden;
      more.textContent = `Show ${Math.min(PAGE_SIZE, Math.max(0, total - rendered.length))} more poems`;
      refreshSelection();
    }

    search.addEventListener('input', () => {
      const terms = normalize(search.value).split(' ').filter(Boolean);
      matches = terms.length ? entries.filter(entry => terms.every(term => entry.searchText.includes(term))) : entries;
      limit = PAGE_SIZE; render();
    });
    more.addEventListener('click', () => {
      const next = rendered.length;
      limit += PAGE_SIZE; render();
      rendered[next]?.button.focus();
    });
    grid.addEventListener('click', event => {
      const button = event.target?.closest?.('button[data-action]');
      if (!button || !grid.contains(button) || button.disabled) return;
      const index = Number(button.dataset.idx);
      if (!Number.isInteger(index) || index < 0 || index >= poems.length) return;
      if (button.dataset.action === 'choose' && typeof onChoose === 'function') onChoose(index);
      else if (button.dataset.action === 'read' && typeof onRead === 'function') onRead(index);
      refreshSelection();
    });

    render();
    return { refreshSelection };
  };
})();

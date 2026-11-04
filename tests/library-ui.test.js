import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

class Element {
  constructor(tag, document) {
    this.tagName = tag.toUpperCase(); this.document = document; this.children = [];
    this.dataset = {}; this.attributes = {}; this.handlers = {}; this.className = ''; this.value = '';
    this.classList = { toggle: (name, selected) => {
      const classes = new Set(this.className.split(' ').filter(Boolean));
      if (selected) classes.add(name); else classes.delete(name);
      this.className = [...classes].join(' ');
    } };
  }
  set innerHTML(_value) { throw new Error('Library text must not be interpreted as HTML.'); }
  setAttribute(name, value) { this.attributes[name] = value; }
  append(...elements) { for (const element of elements) { element.parentElement = this; this.children.push(element); } }
  replaceChildren(...elements) { for (const child of this.children) child.parentElement = null; this.children = []; this.append(...elements); }
  addEventListener(name, handler) { this.handlers[name] = handler; }
  contains(element) { for (let e = element; e; e = e.parentElement) if (e === this) return true; return false; }
  closest() { for (let e = this; e; e = e.parentElement) if (e.tagName === 'BUTTON' && e.dataset.action) return e; return null; }
  focus() { this.document.activeElement = this; }
}

function library(poems = fixture()) {
  const elements = new Map();
  const document = { getElementById: id => elements.get(id), createElement: tag => new Element(tag, document) };
  for (const [id, tag] of [['poemSearch', 'input'], ['poemCount', 'p'], ['poemMoreBtn', 'button'], ['poemGrid', 'div']]) {
    elements.set(id, document.createElement(tag));
  }
  const window = {}, chosen = [], read = []; let selected = 0;
  vm.runInNewContext(readFileSync(new URL('../library-ui.js', import.meta.url), 'utf8'), { window, document, URL });
  const api = window.createEmilyLibrary({ poems, current: () => selected,
    onChoose: index => { selected = index; chosen.push(index); }, onRead: index => { selected = index; read.push(index); } });
  const get = id => elements.get(id);
  const search = value => { get('poemSearch').value = value; get('poemSearch').handlers.input(); };
  const click = element => get('poemGrid').handlers.click({ target: element });
  return { api, document, get, search, click, chosen, read, select: index => { selected = index; } };
}

function fixture() {
  const poems = Array.from({ length: 597 }, (_, index) => ({ id: `poem-${index}`, title: `Poem ${index}`, short: `Poem ${index}`,
    mood: 'LIFE', lines: [`First line ${index}`], source: `https://en.wikisource.org/wiki/Poem_${index}`, edition: '1924' }));
  poems[81] = { ...poems[81], title: 'I’m Nobody! Who are you?', lines: ['A small bird with feathers.'] };
  poems[82] = { ...poems[82], mood: 'NATURE', lines: ['A garden in the spring.'] };
  return poems;
}

const titleButton = card => card.children[0];
const readButton = card => card.children[1].children[0];
const sourceLink = card => card.children[1].children.find(element => element.tagName === 'A');

test('the large library renders 40 poems at a time and resets pagination after search', () => {
  const c = library(), grid = c.get('poemGrid'), more = c.get('poemMoreBtn');
  assert.equal(grid.children.length, 40); assert.match(c.get('poemCount').textContent, /40 of 597/);
  assert.equal(more.hidden, false); more.handlers.click();
  assert.equal(grid.children.length, 80); assert.equal(c.document.activeElement, titleButton(grid.children[40]));
  while (!more.hidden) more.handlers.click();
  assert.equal(grid.children.length, 597); assert.equal(more.disabled, true);
  c.search(''); assert.equal(grid.children.length, 40); assert.equal(more.hidden, false);
});

test('title, full-text, and section searches normalize case and typographic apostrophes', () => {
  const c = library(), grid = c.get('poemGrid');
  c.search("I'M NOBODY"); assert.equal(grid.children.length, 1); assert.equal(titleButton(grid.children[0]).dataset.idx, '81');
  c.search('FEATHERS'); assert.equal(titleButton(grid.children[0]).dataset.idx, '81');
  c.search('nature garden'); assert.equal(grid.children.length, 1); assert.equal(titleButton(grid.children[0]).dataset.idx, '82');
  c.search('words absent from every poem');
  assert.equal(grid.children.length, 1); assert.equal(grid.children[0].tagName, 'P');
  assert.match(grid.children[0].textContent, /No poems match/); assert.match(c.get('poemCount').textContent, /0 matching poems/);
  assert.equal(c.get('poemMoreBtn').hidden, true);
});

test('delegated title and reading controls keep original indexes after filtering', () => {
  const c = library(); c.search('feathers');
  const card = c.get('poemGrid').children[0], button = titleButton(card), read = readButton(card);
  assert.equal(button.type, 'button'); assert.equal(read.type, 'button');
  assert.equal(button.contains(read), false); assert.equal(button.attributes['aria-pressed'], 'false');
  c.click(button.children[0]); assert.deepEqual(c.chosen, [81]); assert.equal(button.attributes['aria-pressed'], 'true');
  c.click(read); assert.deepEqual(c.read, [81]); assert.match(read.attributes['aria-label'], /Hear I’m Nobody/);
  c.select(0); c.api.refreshSelection(); assert.equal(button.attributes['aria-pressed'], 'false');
  assert.deepEqual(Object.keys(button.handlers), []); assert.deepEqual(Object.keys(read.handlers), []);
});

test('poem text is inert and source links allow only exact trusted HTTPS hosts', () => {
  const sources = [
    'https://en.wikisource.org/wiki/Poems', 'https://www.gutenberg.org/ebooks/12242',
    'https://gutenberg.org/ebooks/12242', 'javascript:alert(1)',
    'https://en.wikisource.org.example.com/wiki/Poems', 'http://en.wikisource.org/wiki/Poems',
    'https://user:secret@en.wikisource.org/wiki/Poems', 'https://en.wikisource.org:8443/wiki/Poems',
  ];
  const poems = sources.map((source, index) => ({ ...fixture()[index], source, title: '<img src=x onerror=alert(1)>' }));
  const c = library(poems), cards = c.get('poemGrid').children;
  assert.equal(titleButton(cards[0]).children[0].textContent, '<img src=x onerror=alert(1)>');
  assert.equal(titleButton(cards[0]).children[0].children.length, 0);
  assert.equal(cards.filter(card => sourceLink(card)).length, 3);
  assert.equal(sourceLink(cards[0]).rel, 'noopener noreferrer');
  assert.equal(sourceLink(cards[0]).target, '_blank');
});

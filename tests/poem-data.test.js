import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const context = { window: {} };
vm.runInNewContext(await readFile(new URL('../poems-data.js', import.meta.url), 'utf8'), context);
const poems = JSON.parse(JSON.stringify(context.window.emilyPoemLibrary));
const sources = JSON.parse(await readFile(new URL('../data/poem-sources.json', import.meta.url), 'utf8'));
const normalized = line => line.trim().toLowerCase().replaceAll('’', "'").replace(/\s+/g, ' ');

test('the three early series contain 444 distinct, sourced poems', () => {
  assert.equal(poems.length, 444);
  assert.equal(new Set(poems.map(poem => poem.id)).size, 444);
  assert.equal(new Set(poems.map(poem => poem.source)).size, 444);
  assert.equal(sources.poem_count, 444);
  assert.equal(sources.poems.length, 444);
  assert.equal(context.window.emilyPoemLibraryMetadata.count, 444);
  assert.match(context.window.emilyPoemLibraryMetadata.scopeNote, /not the full modern catalog/);
  assert.match(sources.sha256_source_html, /^[a-f0-9]{64}$/);
  const provenance = new Map(sources.poems.map(record => [record.id, record]));
  for (const poem of poems) {
    assert.match(poem.id, /^pg-[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(['1890', '1891', '1896'].includes(poem.edition));
    assert.ok(poem.title.trim() && poem.short.trim());
    assert.ok(poem.lines.length > 0);
    assert.ok(poem.lines.every(line => typeof line === 'string'));
    assert.equal(normalized(poem.title), normalized(poem.lines.find(line => line.trim())));
    assert.match(poem.source, /^https:\/\/www\.gutenberg\.org\/cache\/epub\/12242\/pg12242-images\.html#[A-Za-z0-9_'-]+$/);
    assert.equal(provenance.get(poem.id)?.source, poem.source);
    assert.equal(provenance.get(poem.id)?.verse_lines, poem.lines.filter(line => line.trim()).length);
  }
});

test('section and edition counts preserve all three early series', () => {
  const expected = { Life: 138, Love: 56, Nature: 110, 'Time and Eternity': 140 };
  const counts = poems.reduce((result, poem) => {
    result[poem.mood] = (result[poem.mood] || 0) + 1;
    return result;
  }, {});
  assert.deepEqual(counts, expected);
  assert.equal(poems[0].id, 'pg-this-is-my-letter-to-the-world');
  const editions = poems.reduce((result, poem) => {
    result[poem.edition] = (result[poem.edition] || 0) + 1;
    return result;
  }, {});
  assert.deepEqual(editions, { '1890': 115, '1891': 164, '1896': 165 });
});

test('familiar poems retain verified source line and stanza boundaries', () => {
  const known = [
    ['pg-hope-is-the-thing-with-feathers', 'hope is the thing with feathers', 12, 3],
    ['pg-a-bird-came-down-the-walk', 'a bird came down the walk:', 20, 5],
    ['pg-im-nobody-who-are-you', "i'm nobody! who are you?", 8, 2],
    ['pg-if-i-can-stop-one-heart-from-breaking', 'if i can stop one heart from breaking,', 7, 1],
  ];
  for (const [id, first, verseLines, stanzas] of known) {
    const poem = poems.find(candidate => candidate.id === id);
    assert.ok(poem, id);
    assert.equal(normalized(poem.lines[0]), first);
    assert.equal(poem.lines.filter(line => line.trim()).length, verseLines, id);
    assert.equal(poem.lines.filter(line => line === '').length + 1, stanzas, id);
  }
  const robin = poems.find(poem => poem.id === known[3][0]);
  assert.deepEqual(robin.lines.map(normalized), [
    'if i can stop one heart from breaking,', 'i shall not live in vain;',
    'if i can ease one life the aching,', 'or cool one pain,',
    'or help one fainting robin', 'unto his nest again,', 'i shall not live in vain.',
  ]);
});

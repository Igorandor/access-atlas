import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DataView, DataDiff } from '../src/components/DataView';

const supplied = () =>
  JSON.parse('{"constructor":"own constructor","toString":"own toString","__proto__":{}}');

test('evidence table shows missing cells rather than inherited reserved properties', () => {
  const html = renderToStaticMarkup(createElement(DataView, { data: [supplied(), {}] }));
  assert.ok(html.includes('own constructor'));
  assert.ok(html.includes('own toString'));
  assert.equal((html.match(/Nested fields/g) || []).length, 1);
  assert.equal((html.match(/Not supplied/g) || []).length, 3);
  assert.ok(!html.includes('function Object'));
  assert.ok(!html.includes('function toString'));
});

test('evidence diff retains reserved-field additions and removals including an empty proto record', () => {
  for (const [before, after] of [
    [{}, supplied()],
    [supplied(), {}],
  ]) {
    const html = renderToStaticMarkup(createElement(DataDiff, { before, after }));
    assert.equal((html.match(/scope="row"/g) || []).length, 3);
    assert.equal((html.match(/Not supplied/g) || []).length, 3);
    assert.equal((html.match(/Empty record/g) || []).length, 1);
    assert.ok(html.includes('own constructor'));
    assert.ok(html.includes('own toString'));
    assert.ok(!html.includes('function '));
  }
  const unchanged = renderToStaticMarkup(
    createElement(DataDiff, { before: supplied(), after: supplied() }),
  );
  assert.equal((unchanged.match(/scope="row"/g) || []).length, 0);
});

test('ordinary false, zero, empty text, null and nested evidence retain their display', () => {
  const html = renderToStaticMarkup(
    createElement(DataView, {
      data: [{ Flag: false, Count: 0, Text: '', Missing: null, Values: [1, 2] }, null],
    }),
  );
  assert.ok(html.includes('>No</span>'));
  assert.ok(html.includes('>0</span>'));
  assert.ok(html.includes('(empty text)'));
  assert.ok(html.includes('2 items'));
  assert.equal((html.match(/Not supplied/g) || []).length, 6);
});

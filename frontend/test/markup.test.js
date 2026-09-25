import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { markupRuns } from '../src/lib/markup.js';

const localesDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../src/locales');

describe('markupRuns', () => {
  it('returns plain text as one text run', () => {
    expect(markupRuns('Drop a file here')).toEqual([{ kind: 'text', text: 'Drop a file here' }]);
  });

  it('returns nothing for an empty message', () => {
    expect(markupRuns('')).toEqual([]);
  });

  it('splits strong and code runs from the text around them', () => {
    expect(markupRuns('Click <strong>Upload</strong> and drop a <code>.gpx</code> file.')).toEqual([
      { kind: 'text', text: 'Click ' },
      { kind: 'strong', text: 'Upload' },
      { kind: 'text', text: ' and drop a ' },
      { kind: 'code', text: '.gpx' },
      { kind: 'text', text: ' file.' },
    ]);
  });

  it('decodes entities inside and outside marked runs', () => {
    expect(
      markupRuns('Drag &amp; drop <strong>a &lt;b&gt;</strong> &quot;x&quot; &#39;y&#39;'),
    ).toEqual([
      { kind: 'text', text: 'Drag & drop ' },
      { kind: 'strong', text: 'a <b>' },
      { kind: 'text', text: ' "x" \'y\'' },
    ]);
  });

  it('keeps unknown entities as written', () => {
    expect(markupRuns('&nbsp;&amp')).toEqual([{ kind: 'text', text: '&nbsp;&amp' }]);
  });

  it('keeps any other markup as literal text, never as an element', () => {
    const hostile =
      '<img src=x onerror=alert(1)><script>alert(1)</script><a href="javascript:x">y</a>';
    expect(markupRuns(hostile)).toEqual([{ kind: 'text', text: hostile }]);
  });

  it('keeps mismatched or nested tags literal', () => {
    expect(markupRuns('<strong>x</code>')).toEqual([{ kind: 'text', text: '<strong>x</code>' }]);
    expect(markupRuns('<strong><code>x</code></strong>')).toEqual([
      { kind: 'text', text: '<strong>' },
      { kind: 'code', text: 'x' },
      { kind: 'text', text: '</strong>' },
    ]);
  });

  it('renders every locale string without leaving markup behind', () => {
    for (const file of readdirSync(localesDirectory)) {
      const messages = JSON.parse(readFileSync(resolve(localesDirectory, file), 'utf8'));
      for (const message of Object.values(messages)) {
        const text = markupRuns(message)
          .map((run) => run.text)
          .join('');
        expect(text, `${file}: ${message}`).not.toMatch(/<\/?(strong|code)>|&amp;/);
      }
    }
  });
});

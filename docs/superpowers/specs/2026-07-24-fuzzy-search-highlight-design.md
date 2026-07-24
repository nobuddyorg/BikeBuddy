# Fuzzy search highlight — design

**Issue:** [#299](https://github.com/nobuddyorg/BikeBuddy/issues/299)
**Status:** Approved, ready for implementation plan

## Problem

The tour list search (`frontend/src/lib/tours.js` `fuzzyMatch`) is a subsequence match: every character of the query must appear in order within the tour name, but not necessarily contiguously (e.g. `"atr"` matches `"Alps Tour"` via A..T..(ou)R). This is powerful but opaque — a user typing a query sees tours appear in the results without any indication of _why_ a given tour matched, especially when the matched characters are scattered non-contiguously through the name.

## Goals

- When the search box has a query, matched tour names in the sidebar list show which characters caused the match.
- Highlighting reflects the exact algorithm already used to decide matches (no separate/divergent highlighting heuristic).
- No visual change when the search box is empty — list renders exactly as it does today.

## Non-goals

- No change to the matching algorithm itself (still greedy left-to-right subsequence match).
- No highlighting in other search inputs (e.g. the language switcher) — issue is scoped to tour search.

## Design

**`frontend/src/lib/tours.js`**

Add `fuzzyMatchIndices(query, text)`, running the same greedy scan as today's `fuzzyMatch`, returning:

- `[]` if the (trimmed) query is empty — matches trivially, nothing to highlight.
- an array of matched character indices into `text`, in ascending order, if the full query matched.
- `null` if the query did not fully match.

Rewrite `fuzzyMatch` in terms of it so there is one source of truth for the algorithm:

```js
export function fuzzyMatchIndices(query, text) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const t = (text || '').toLowerCase();
  const indices = [];
  let i = 0;
  for (let pos = 0; pos < t.length && i < q.length; pos++) {
    if (t[pos] === q[i]) {
      indices.push(pos);
      i++;
    }
  }
  return i === q.length ? indices : null;
}

export function fuzzyMatch(query, text) {
  return fuzzyMatchIndices(query, text) !== null;
}
```

`visibleTours` is unchanged — it already only depends on `fuzzyMatch`'s boolean result.

**`frontend/src/app.js`**

Add a helper that turns a name + matched indices into a DOM node, merging consecutive indices into single `<mark>` runs (not one `<mark>` per letter) and using `createElement`/`textContent`/`appendChild` throughout — never `innerHTML` — so a user-supplied tour name can't be interpreted as markup:

```js
function highlightedNameNode(name, indices) {
  const div = document.createElement('div');
  div.className = 'tour-item-name';
  const matched = new Set(indices);
  let i = 0;
  while (i < name.length) {
    let j = i;
    while (j < name.length && matched.has(j) === matched.has(i)) j++;
    const run = name.slice(i, j);
    if (matched.has(i)) {
      const mark = document.createElement('mark');
      mark.textContent = run;
      div.appendChild(mark);
    } else {
      div.appendChild(document.createTextNode(run));
    }
    i = j;
  }
  return div;
}
```

In `createTourItem`, replace:

```js
textDiv('tour-item-name', tour.name);
```

with:

```js
highlightedNameNode(tour.name, fuzzyMatchIndices(state.search, tour.name));
```

With an empty search, `fuzzyMatchIndices` returns `[]`, so `highlightedNameNode` produces a single text node — identical rendered output to today's `textDiv`.

**`frontend/src/style.css`**

```css
.tour-item-name mark {
  background: none;
  color: var(--color-primary);
  font-weight: 700;
}
```

Uses the existing `--color-primary` variable (orange, `#f97316`), which already has light/dark values defined, so no new theme work is needed.

## Testing plan

- `frontend/test/tours.test.js`: unit tests for `fuzzyMatchIndices` — matched positions for an in-order subsequence, `null` for a non-match, `[]` for an empty/whitespace query. Existing `fuzzyMatch`/`visibleTours` tests are unaffected since behavior doesn't change.
- No e2e coverage planned — this is a pure rendering detail of already-covered list logic; a DOM-level unit check isn't part of this repo's existing test setup for `app.js` (untested UI glue, consistent with the rest of that file).

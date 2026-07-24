# Fuzzy Search Highlight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Highlight the characters that caused a tour name to match the sidebar's fuzzy search query, so users can see why a result matched.

**Architecture:** Extract the matched-character indices from the existing greedy subsequence-match algorithm in `frontend/src/lib/tours.js` (pure logic, unit tested), then consume those indices in `frontend/src/app.js` to build a DOM node that wraps matched runs in `<mark>` elements, styled via CSS.

**Tech Stack:** Vanilla JS (no framework), Vitest for unit tests, plain CSS with custom properties for theming.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-24-fuzzy-search-highlight-design.md`
- One GitHub issue per commit; every commit subject must include `#299`.
- Never build user-controlled text (tour names) via `innerHTML` — use `createElement`/`textContent`/`appendChild` only.
- Highlighting must reflect the exact matching algorithm already used to decide matches — no separate heuristic.
- Empty search query must render identically to today's plain-text output (no `<mark>` wrapping at all).
- Merge consecutive matched indices into single `<mark>` runs — do not wrap each matched letter individually.

---

### Task 1: `fuzzyMatchIndices` in `frontend/src/lib/tours.js`

**Files:**

- Modify: `frontend/src/lib/tours.js:16-26` (the `fuzzyMatch` function)
- Test: `frontend/test/tours.test.js`

**Interfaces:**

- Produces: `export function fuzzyMatchIndices(query, text)` → `number[] | null`.
  - Returns `[]` if `query.trim()` is empty (matches trivially, nothing to highlight).
  - Returns an ascending array of matched character indices into `text` if the full (lowercased) query matched as an in-order subsequence.
  - Returns `null` if the query did not fully match.
- Produces: `export function fuzzyMatch(query, text)` → `boolean`, now implemented as `fuzzyMatchIndices(query, text) !== null`. Signature and behavior unchanged from before — existing callers (`visibleTours`) need no changes.

- [ ] **Step 1: Write the failing tests**

  Add this `describe` block to `frontend/test/tours.test.js`, placed after the existing `describe('fuzzyMatch', ...)` block (which stays as-is):

  ```js
  describe('fuzzyMatchIndices', () => {
    it('returns the matched character positions for an in-order subsequence', () => {
      expect(fuzzyMatchIndices('alp', 'Alps Tour')).toEqual([0, 1, 2]);
      expect(fuzzyMatchIndices('atr', 'Alps Tour')).toEqual([0, 5, 8]); // A..T..(ou)R
    });

    it('returns null when the query does not fully match', () => {
      expect(fuzzyMatchIndices('xyz', 'Alps Tour')).toBeNull();
      expect(fuzzyMatchIndices('rua', 'Alps Tour')).toBeNull();
    });

    it('returns an empty array for an empty or whitespace query', () => {
      expect(fuzzyMatchIndices('', 'Alps Tour')).toEqual([]);
      expect(fuzzyMatchIndices('   ', 'Alps Tour')).toEqual([]);
    });

    it('matches case-insensitively but indexes into the original text', () => {
      expect(fuzzyMatchIndices('ALP', 'Alps Tour')).toEqual([0, 1, 2]);
    });
  });
  ```

  Update the import line at the top of the file:

  ```js
  import { fuzzyMatch, fuzzyMatchIndices, visibleTours, paginate } from '../src/lib/tours.js';
  ```

- [ ] **Step 2: Run tests to verify they fail**

  Run: `cd frontend && npx vitest run test/tours.test.js`
  Expected: FAIL — `fuzzyMatchIndices is not a function` (or similar import error), other existing tests in the file still pass.

- [ ] **Step 3: Implement `fuzzyMatchIndices` and rewrite `fuzzyMatch`**

  Replace lines 16-26 of `frontend/src/lib/tours.js` (the comment + `fuzzyMatch` function) with:

  ```js
  // Subsequence match: every char of the query appears in order within the text.
  // Returns the matched indices into `text` (empty array for an empty query),
  // or null if the query does not fully match.
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

- [ ] **Step 4: Run tests to verify they pass**

  Run: `cd frontend && npx vitest run test/tours.test.js`
  Expected: PASS — all tests in `describe('fuzzyMatchIndices', ...)` and the pre-existing `fuzzyMatch`/`visibleTours`/`paginate` blocks.

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/src/lib/tours.js frontend/test/tours.test.js
  git commit -m "feat: add fuzzyMatchIndices to expose matched search positions (#299)"
  ```

---

### Task 2: Render highlighted tour names in `frontend/src/app.js`

**Files:**

- Modify: `frontend/src/app.js:4` (import line)
- Modify: `frontend/src/app.js:608-655` (`createTourItem`, add `highlightedNameNode` alongside it)
- Modify: `frontend/src/style.css:352-357` (`.tour-item-name` rule block)

**Interfaces:**

- Consumes: `fuzzyMatchIndices(query, text)` from Task 1 (`frontend/src/lib/tours.js`), returning `number[] | null`.
- Consumes: module-level `state.search` (already read elsewhere in `app.js`, e.g. line 680 `visibleTours(state.tours, state.sort, state.search)`).
- Produces: `function highlightedNameNode(name, indices)` → `HTMLDivElement` with class `tour-item-name`, used only inside `createTourItem`.

- [ ] **Step 1: Update the import to include `fuzzyMatchIndices`**

  Change `frontend/src/app.js:4` from:

  ```js
  import { visibleTours, paginate, PAGE_SIZE } from './lib/tours.js';
  ```

  to:

  ```js
  import { visibleTours, paginate, PAGE_SIZE, fuzzyMatchIndices } from './lib/tours.js';
  ```

- [ ] **Step 2: Add `highlightedNameNode` above `createTourItem`**

  Insert this function immediately before `function createTourItem(tour) {` (currently `frontend/src/app.js:608`):

  ```js
  // Builds the tour-item-name div, wrapping runs of consecutive matched
  // indices in <mark>. Built with createElement/textContent only — tour
  // names are user-supplied and must never be interpreted as markup.
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

- [ ] **Step 3: Wire it into `createTourItem`**

  In `createTourItem` (`frontend/src/app.js:627-635`), change:

  ```js
  const details = document.createElement('div');
  details.className = 'tour-item-details';
  details.append(
    textDiv('tour-item-name', tour.name),
    textDiv(
      'tour-item-meta',
      `${formatDate(tour.createdAt, i18n.dateLocale())} · ${formatDistance(tour.distance)}`,
    ),
  );
  ```

  to:

  ```js
  const details = document.createElement('div');
  details.className = 'tour-item-details';
  details.append(
    highlightedNameNode(tour.name, fuzzyMatchIndices(state.search, tour.name)),
    textDiv(
      'tour-item-meta',
      `${formatDate(tour.createdAt, i18n.dateLocale())} · ${formatDistance(tour.distance)}`,
    ),
  );
  ```

- [ ] **Step 4: Add the `<mark>` style**

  In `frontend/src/style.css`, the `.tour-item-name` rule currently reads (lines 352-357):

  ```css
  .tour-item-name {
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  ```

  Add a new rule directly after it:

  ```css
  .tour-item-name mark {
    background: none;
    color: var(--color-primary);
    font-weight: 700;
  }
  ```

- [ ] **Step 5: Run the unit test suite**

  Run: `cd frontend && npx vitest run`
  Expected: PASS — no test targets `app.js` directly, this confirms Task 1's tests and the rest of the suite are still green after the import change.

- [ ] **Step 6: Manually verify in the browser**

  Run: `./buddy.sh development start-all` from the repo root (starts the full local stack, Docker must be running) and open `http://localhost:4280`.

  - Sign in, ensure at least two tours exist with distinguishable names (e.g. "Alps Tour", "Beach Ride").
  - Type a fuzzy, non-contiguous query into the tour search box (e.g. `atr` to match "Alps Tour" via A..T..(ou)R).
  - Confirm the matched letters render bold and orange (`--color-primary`) inside the tour name, and non-matched letters render normally.
  - Clear the search box and confirm tour names render exactly as plain text (no stray `<mark>`, no layout shift).
  - Toggle the OS/browser dark mode and confirm the highlight color still reads clearly against the dark surface.

- [ ] **Step 7: Commit**

  ```bash
  git add frontend/src/app.js frontend/src/style.css
  git commit -m "feat: highlight matched characters in tour search results (#299)"
  ```

---

## Post-plan

- Update the GitHub issue: comment or note that PR closes #299 with `Fixes #299` in the PR body per this repo's workflow convention.

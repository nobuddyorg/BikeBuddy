'use strict';

const PAGE_SIZE = 100;

// Pages through the query instead of draining it with fetchAll(), so a large
// container is never held in memory at once.
async function* queryItems(container, query) {
  const pages = container.items.query(query, { maxItemCount: PAGE_SIZE }).getAsyncIterator();
  for await (const { resources } of pages) yield* resources;
}

module.exports = { queryItems, PAGE_SIZE };

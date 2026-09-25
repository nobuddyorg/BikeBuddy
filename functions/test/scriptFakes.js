'use strict';

// In-memory stand-ins for the Cosmos client the operator scripts use.
// `writes` records every mutating call, so a test can assert a dry run made none.

function notFound() {
  return Object.assign(new Error('Entity with the specified id does not exist'), { code: 404 });
}

function applyPatch(document, operations) {
  for (const { op, path, value } of operations) {
    if (op !== 'set') throw new Error(`Unsupported patch operation ${op}`);
    document[path.slice(1)] = value;
  }
}

// answerQuery(documents) plays the SQL: it returns the rows the real query would.
function fakeCosmosContainer({ documents, answerQuery, partitionKeyOf }) {
  const writes = [];
  const queries = [];
  const find = (id, partitionKey) =>
    documents.findIndex(
      (document) => document.id === id && partitionKeyOf(document) === partitionKey,
    );

  const container = {
    items: {
      query(query, options) {
        queries.push({ query, options });
        return {
          async *getAsyncIterator() {
            const rows = answerQuery(documents);
            for (let start = 0; start < rows.length; start += options.maxItemCount) {
              yield { resources: rows.slice(start, start + options.maxItemCount) };
            }
          },
        };
      },
    },
    item(id, partitionKey) {
      return {
        async delete() {
          writes.push({ delete: id, partitionKey });
          const index = find(id, partitionKey);
          if (index === -1) throw notFound();
          documents.splice(index, 1);
        },
        async patch(operations) {
          writes.push({ patch: id, partitionKey, operations });
          const index = find(id, partitionKey);
          if (index === -1) throw notFound();
          applyPatch(documents[index], operations);
        },
      };
    },
  };
  return { container, documents, writes, queries };
}

module.exports = { fakeCosmosContainer };

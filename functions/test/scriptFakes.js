'use strict';

// In-memory stand-ins for the Cosmos and Blob clients the operator scripts use.
// `writes` records every mutating call, so a test can assert a dry run made none.

function notFound() {
  return Object.assign(new Error('Entity with the specified id does not exist'), { code: 404 });
}

function applyPatch(document, operations) {
  for (const { op, path, value } of operations) {
    if (op === 'set') document[path.slice(1)] = value;
    else if (op === 'remove') delete document[path.slice(1)];
    else throw new Error(`Unsupported patch operation ${op}`);
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
      async upsert(document) {
        writes.push({ upsert: document.id, partitionKey: partitionKeyOf(document) });
        const index = find(document.id, partitionKeyOf(document));
        if (index === -1) documents.push(structuredClone(document));
        else documents[index] = structuredClone(document);
        return { resource: structuredClone(document) };
      },
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
        async read() {
          const index = find(id, partitionKey);
          if (index === -1) throw notFound();
          return { resource: structuredClone(documents[index]) };
        },
        async delete() {
          writes.push({ delete: id, partitionKey });
          const index = find(id, partitionKey);
          if (index === -1) throw notFound();
          documents.splice(index, 1);
        },
        async patch(operations, options) {
          writes.push({ patch: id, partitionKey, operations, ...(options && { options }) });
          const index = find(id, partitionKey);
          if (index === -1) throw notFound();
          applyPatch(documents[index], operations);
        },
      };
    },
  };
  return { container, documents, writes, queries };
}

function fakeBlobContainer(blobs) {
  const writes = [];
  const container = {
    getBlockBlobClient(name) {
      return {
        name,
        async exists() {
          return blobs.has(name);
        },
        async downloadToBuffer() {
          if (!blobs.has(name)) throw Object.assign(new Error('BlobNotFound'), { statusCode: 404 });
          return blobs.get(name);
        },
        async getProperties() {
          if (!blobs.has(name)) throw Object.assign(new Error('BlobNotFound'), { statusCode: 404 });
          return { contentLength: blobs.get(name).length };
        },
        async uploadData(data, options) {
          writes.push({ upload: name, options });
          blobs.set(name, data);
        },
      };
    },
  };
  return { container, blobs, writes };
}

module.exports = { fakeCosmosContainer, fakeBlobContainer };

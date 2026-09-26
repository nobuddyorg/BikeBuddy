'use strict';

// In-memory Container subset: partitions, patches, ETags, conflicts, no cross-partition query.

const cosmosError = (code, message) => Object.assign(new Error(message), { code });
const clone = (value) => (value === undefined ? undefined : structuredClone(value));

function applyPatch(document, { op, path, value }) {
  const [field, position] = path.slice(1).split('/');
  if (op === 'add' && position === '-') {
    if (!Array.isArray(document[field])) throw cosmosError(400, `${path} is not an array`);
    document[field].push(value);
    return;
  }
  if (!['add', 'set', 'replace'].includes(op) || position !== undefined) {
    throw new Error(`fake Cosmos: unsupported patch ${op} ${path}`);
  }
  document[field] = value;
}

// SELECT <* | c.a, ARRAY_LENGTH(c.b) AS n, ...> FROM c [WHERE c.x = @x [AND IS_DEFINED(c.y) ...]]
// [ORDER BY c.y [ASC|DESC]]
const FIELD = String.raw`(?:c\.\w+|ARRAY_LENGTH\(c\.\w+\) AS \w+)`;
const QUERY_PATTERN = new RegExp(
  String.raw`^SELECT (?<fields>\*|${FIELD}(?:, ${FIELD})*) FROM c(?: WHERE (?<where>.+?))?` +
    String.raw`(?: ORDER BY c\.(?<orderBy>\w+)(?: (?<direction>ASC|DESC))?)?$`,
);

function conditionOf(condition, valueOf) {
  const defined = /^IS_DEFINED\(c\.(\w+)\)$/.exec(condition);
  if (defined) return (document) => defined[1] in document;
  const [, field, parameter] = /^c\.(\w+) = (@\w+)$/.exec(condition);
  return (document) => document[field] === valueOf(parameter);
}

// Cosmos leaves a projected property out when its value is undefined.
function projectionOf(field) {
  const length = /^ARRAY_LENGTH\(c\.(\w+)\) AS (\w+)$/.exec(field);
  if (length) {
    const [, source, alias] = length;
    return (document) =>
      Array.isArray(document[source]) ? [[alias, document[source].length]] : [];
  }
  const name = field.slice(2);
  return (document) => (name in document ? [[name, document[name]]] : []);
}

function runQuery(documents, { query, parameters }) {
  const match = QUERY_PATTERN.exec(query.replace(/\s+/g, ' ').trim());
  if (!match) throw new Error(`fake Cosmos: unsupported query ${query}`);
  const { fields, where, orderBy, direction } = match.groups;
  const valueOf = (name) => parameters.find((parameter) => parameter.name === name).value;
  const conditions = (where ? where.split(' AND ') : []).map((condition) =>
    conditionOf(condition, valueOf),
  );
  const selected = documents.filter((document) => conditions.every((matches) => matches(document)));
  if (orderBy) {
    const sign = direction === 'DESC' ? -1 : 1;
    selected.sort((left, right) => (left[orderBy] > right[orderBy] ? sign : -sign));
  }
  if (fields === '*') return selected;
  const projections = fields.split(/, (?=c\.|ARRAY_LENGTH)/).map(projectionOf);
  return selected.map((document) =>
    Object.fromEntries(projections.flatMap((project) => project(document))),
  );
}

function createFakeContainer({ partitionKeyPath, documents = [] }) {
  const stored = new Map();
  const failures = [];
  const hooks = [];
  const calls = [];
  let etagCounter = 0;

  const keyOf = (id, partitionKey) => JSON.stringify([partitionKey, id]);
  const put = (document) => {
    const saved = { ...clone(document), _etag: `"etag-${++etagCounter}"`, _ts: etagCounter };
    stored.set(keyOf(saved.id, saved[partitionKeyPath]), saved);
    return clone(saved);
  };
  documents.forEach(put);

  async function perform(operation, details, action) {
    calls.push({ operation, ...details });
    const hook = hooks.findIndex((entry) => entry.operation === operation);
    if (hook !== -1) await hooks.splice(hook, 1)[0].callback();
    const failure = failures.find((entry) => entry.operation === operation && entry.times > 0);
    if (failure) {
      failure.times -= 1;
      throw failure.error;
    }
    return action();
  }

  const item = (id, partitionKey) => {
    const key = keyOf(id, partitionKey);
    const existing = () => {
      if (!stored.has(key)) throw cosmosError(404, 'Entity with the specified id does not exist');
      return stored.get(key);
    };
    return {
      read: () =>
        perform('read', { id, partitionKey }, () => ({ resource: clone(stored.get(key)) })),
      patch: (operations, options) =>
        perform('patch', { id, partitionKey, operations, options }, () => {
          const document = clone(existing());
          const condition = options?.accessCondition;
          if (condition && document._etag !== condition.condition) {
            throw cosmosError(412, 'Precondition failed');
          }
          operations.forEach((operation) => applyPatch(document, operation));
          return { resource: put(document) };
        }),
      replace: (document, options) =>
        perform('replace', { id, partitionKey, options }, () => {
          const condition = options?.accessCondition;
          if (condition && existing()._etag !== condition.condition) {
            throw cosmosError(412, 'Precondition failed');
          }
          existing();
          if (document[partitionKeyPath] !== partitionKey) {
            throw cosmosError(400, 'Partition key of the document does not match the item');
          }
          return { resource: put(document) };
        }),
      delete: () =>
        perform('delete', { id, partitionKey }, () => {
          existing();
          stored.delete(key);
          return {};
        }),
    };
  };

  const items = {
    create: (document) =>
      perform('create', { id: document.id, partitionKey: document[partitionKeyPath] }, () => {
        if (stored.has(keyOf(document.id, document[partitionKeyPath]))) {
          throw cosmosError(409, 'Entity with the specified id already exists');
        }
        return { resource: put(document) };
      }),
    upsert: (document) =>
      perform('upsert', { id: document.id, partitionKey: document[partitionKeyPath] }, () => ({
        resource: put(document),
      })),
    query: (spec, options) => ({
      fetchAll: () =>
        perform('query', { spec, options }, () => {
          if (options?.partitionKey === undefined) {
            throw new Error('fake Cosmos: cross-partition query in a request path');
          }
          const partition = [...stored.values()].filter(
            (document) => document[partitionKeyPath] === options.partitionKey,
          );
          return { resources: clone(runQuery(partition, spec)) };
        }),
    }),
  };

  return {
    item,
    items,
    // Test-side access, never used by the code under test.
    calls,
    stored: (id, partitionKey) => clone(stored.get(keyOf(id, partitionKey))),
    all: () => [...stored.values()].map(clone),
    seed: put,
    failOn: (operation, { error, times = 1 }) => failures.push({ operation, error, times }),
    beforeNext: (operation, callback) => hooks.push({ operation, callback }),
  };
}

const fakeToursContainer = (documents = []) =>
  createFakeContainer({ partitionKeyPath: 'userId', documents });
const fakeUsersContainer = (documents = []) =>
  createFakeContainer({ partitionKeyPath: 'id', documents });
const fakeTracksContainer = (documents = []) =>
  createFakeContainer({ partitionKeyPath: 'userId', documents });

module.exports = { fakeToursContainer, fakeUsersContainer, fakeTracksContainer, cosmosError };

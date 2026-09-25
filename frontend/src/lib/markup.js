// @ts-check

/** @type {Record<string, string>} */
const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const ENTITY = /&(?:amp|lt|gt|quot|#39);/g;
const MARKED_RUN = /(<(?:strong|code)>[^<]*<\/(?:strong|code)>)/;
const MARKED_PARTS = /<(strong|code)>([^<]*)<\/\1>/;

function decodeEntities(text) {
  return text.replace(ENTITY, (entity) => ENTITIES[entity]);
}

function toRun(part) {
  const marked = MARKED_PARTS.exec(part);
  if (!marked) return { kind: 'text', text: decodeEntities(part) };
  return { kind: marked[1], text: decodeEntities(marked[2]) };
}

// Locale strings may emphasise with <strong> and <code>; anything else stays literal text.
export function markupRuns(message) {
  return message
    .split(MARKED_RUN)
    .filter((part) => part !== '')
    .map(toRun);
}

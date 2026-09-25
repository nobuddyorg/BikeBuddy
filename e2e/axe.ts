import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Accessibility gate for the journeys: zero violations of WCAG 2.x A/AA plus
// axe's best practices (the latter is where a dialog's missing name, a missing
// <main> or <h1> live). Call it at every meaningful state (page loaded, dialog
// open, error shown); on failure the violations are attached to the report as JSON.

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

// Accepted exclusions: a selector with its reason, never a disabled rule.
const EXCLUDED: { selector: string; reason: string }[] = [];

export async function expectNoAxeViolations(page: Page, context: string) {
  let builder = new AxeBuilder({ page }).withTags(AXE_TAGS);
  for (const { selector } of EXCLUDED) builder = builder.exclude(selector);
  const { violations } = await builder.analyze();

  if (violations.length > 0) {
    await test.info().attach(`axe-${context}.json`, {
      body: JSON.stringify(violations, null, 2),
      contentType: 'application/json',
    });
  }
  // One line per failing node: rule, element, and axe's own explanation (e.g. the measured contrast).
  const summary = violations.flatMap((v) =>
    v.nodes.map(
      (n) => `${v.id} (${v.impact}) ${n.target.join(' ')}: ${n.any[0]?.message ?? v.help}`,
    ),
  );
  expect(summary, `axe violations at "${context}"`).toEqual([]);
}

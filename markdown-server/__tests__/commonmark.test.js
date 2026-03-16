const { tests: spec } = require('commonmark-spec');
const { marked } = require('marked');

// Minimal normalization: strip trailing whitespace per line so that
// "foo \n" and "foo\n" are treated as equal.
function normalize(html) {
  return html.split('\n').map(l => l.trimEnd()).join('\n').trimEnd();
}

function runSpec() {
  return spec.map(({ markdown, html, section, number }) => {
    const actual = normalize(marked.parse(markdown));
    const expected = normalize(html);
    return { number, section, markdown, expected, actual, passed: actual === expected };
  });
}

describe('CommonMark conformance', () => {
  // Run once and share across tests in this suite
  let results;
  beforeAll(() => { results = runSpec(); });

  test('passes at least 70% of spec examples (regression guard)', () => {
    const passed = results.filter(r => r.passed).length;
    const total = results.length;
    const rate = passed / total;
    const BASELINE = 0.70;

    // Always print the rate so CI logs are informative
    console.log(`CommonMark conformance: ${passed}/${total} (${(rate * 100).toFixed(1)}%)`);

    if (rate < BASELINE) {
      const sample = results
        .filter(r => !r.passed)
        .slice(0, 5)
        .map(r =>
          `  #${r.number} ${r.section}\n` +
          `    md:       ${JSON.stringify(r.markdown)}\n` +
          `    expected: ${JSON.stringify(r.expected)}\n` +
          `    actual:   ${JSON.stringify(r.actual)}`
        )
        .join('\n');
      throw new Error(
        `Rate ${(rate * 100).toFixed(1)}% is below the ${Math.round(BASELINE * 100)}% baseline.\n` +
        `Sample failures:\n${sample}`
      );
    }
  });

  test('logs per-section failures for visibility', () => {
    const sections = {};
    for (const r of results) {
      sections[r.section] ??= { passed: 0, total: 0 };
      sections[r.section].total++;
      if (r.passed) sections[r.section].passed++;
    }

    const failing = Object.entries(sections)
      .filter(([, s]) => s.passed < s.total)
      .sort(([, a], [, b]) => (a.passed / a.total) - (b.passed / b.total))
      .map(([name, s]) => `  ${s.passed}/${s.total}  ${name}`)
      .join('\n');

    if (failing) {
      console.log(`Sections with partial failures (sorted by pass rate):\n${failing}`);
    }

    // This test is informational — it never blocks CI
    expect(true).toBe(true);
  });
});

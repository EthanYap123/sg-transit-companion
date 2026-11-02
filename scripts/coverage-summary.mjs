// Prints a Vitest json-summary coverage file as a Markdown table, for the GitHub Actions job summary.
// Usage: node scripts/coverage-summary.mjs apps/api/coverage/coverage-summary.json
import { existsSync, readFileSync } from 'node:fs';

const THRESHOLD = 70;
const file = process.argv[2];

if (!file || !existsSync(file)) {
  console.log('### API test coverage\n\nNo coverage report was produced (the tests did not finish).');
  process.exit(0);
}

const { total } = JSON.parse(readFileSync(file, 'utf8'));
const rows = ['lines', 'statements', 'functions', 'branches'].map((metric) => {
  const { pct, covered, total: all } = total[metric];
  const mark = pct >= THRESHOLD ? '✅' : '❌';
  return `| ${metric[0].toUpperCase()}${metric.slice(1)} | ${pct.toFixed(1)}% | ${covered} / ${all} | ${mark} |`;
});

console.log(
  [
    '### API test coverage',
    '',
    `Minimum: ${THRESHOLD}% for each measure.`,
    '',
    '| Measure | Coverage | Covered | Meets minimum |',
    '| --- | --- | --- | --- |',
    ...rows,
  ].join('\n'),
);

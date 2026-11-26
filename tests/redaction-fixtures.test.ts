import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { regexRedact } from '../src/redaction/regex';

const { cases } = JSON.parse(readFileSync('corpus/redaction-fixtures.json', 'utf8')) as { cases: { id: string; text: string; remove: string[]; keep: string[] }[] };

describe('shared redaction cases (the Android redactor runs the same file)', () => {
  it.each(cases.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    const out = regexRedact(c.text).text;
    for (const v of c.remove) expect(out, v).not.toContain(v);
    for (const v of c.keep) expect(out, v).toContain(v);
  });
});

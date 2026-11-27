/**
 * The practice pages in demo/ are the judged demo. This pins their behavior
 * with NO model at all (built-in rules only, the worst case): every scam page
 * is flagged, the matching action trips, and the ordinary checkout stays silent.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config/defaults';
import type { AiEngine } from '../src/inference/engine';
import { assess } from '../src/inference/router';
import type { Trigger } from '../src/inference/schemas';

const noModel: AiEngine = {
  onDeviceStatus: async () => 'unavailable',
  triageOnDevice: () => Promise.reject(new Error('no model')),
  redactOnDevice: () => Promise.reject(new Error('no model')),
  analyzeInCloud: () => Promise.reject(new Error('no model')),
};
const deps = { engine: noModel, config: DEFAULT_CONFIG };

const pages = readdirSync('demo')
  .filter((f) => f.endsWith('.html') && f !== 'index.html')
  .map((file) => {
    const html = readFileSync(`demo/${file}`, 'utf8');
    const body = html.slice(html.indexOf('<body'));
    return {
      file,
      scenario: /data-scenario="(\w+)"/.exec(html)?.[1],
      trigger: /data-trigger="(\w+)"/.exec(html)?.[1] as Trigger,
      // Roughly what the content script reads: the visible text of the page.
      text: body.replace(/<[^>]+>/g, ' ').replace(/&times;|×/g, 'x').replace(/\s+/g, ' ').trim(),
    };
  });

describe('practice pages, rules only', () => {
  it('covers four loud scams, one quiet one and two ordinary pages', () => {
    expect(pages.filter((p) => p.scenario === 'scam')).toHaveLength(4);
    expect(pages.filter((p) => p.scenario === 'subtle')).toHaveLength(1);
    expect(pages.filter((p) => p.scenario === 'benign')).toHaveLength(2);
  });

  for (const page of pages) {
    if (page.scenario === 'scam') {
      it(`${page.file}: flagged on reading, paused on ${page.trigger}`, async () => {
        const passive = await assess({ text: page.text, hostname: 'localhost', trigger: 'passive' }, deps);
        expect(passive.state).not.toBe('safe');
        expect(passive.bytesSentToCloud).toBe(0);
        const action = await assess({ text: page.text, hostname: 'localhost', trigger: page.trigger }, deps);
        expect(action.state).toBe('tripped');
      });
    } else if (page.scenario === 'subtle') {
      it(`${page.file}: too quiet for rules alone, but it does reach a model`, async () => {
        const passive = await assess({ text: page.text, hostname: 'localhost', trigger: 'passive' }, deps);
        // Not waved through by the gate: with a model available it gets a real check.
        expect(passive.route).not.toBe('not_checked');
        expect(passive.bytesSentToCloud).toBe(0);
      });
    } else {
      it(`${page.file}: stays silent, even when a card number is typed`, async () => {
        for (const trigger of ['passive', 'card_entry'] as const) {
          const verdict = await assess({ text: page.text, hostname: 'localhost', trigger }, deps);
          expect(verdict.state).toBe('safe');
        }
      });
    }
  }
});

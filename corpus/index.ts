/**
 * Tripwire's local test corpus. Every sample is invented: the people, phone
 * numbers (555 range), addresses, account numbers and domains (.example) are
 * all fake. The card numbers that appear in tests are public test numbers.
 */
import type { Trigger } from '../src/inference/schemas';
import benign from './benign.json';
import scams from './scams.json';

export interface CorpusSample {
  id: string;
  label: 'scam' | 'benign';
  category: string;
  hostname: string;
  trigger: Trigger;
  text: string;
}

type Raw = Omit<CorpusSample, 'label' | 'trigger'> & { trigger: string };

const withLabel = (label: CorpusSample['label']) => (s: Raw): CorpusSample => ({
  ...s,
  label,
  trigger: s.trigger as Trigger,
});

export const SCAM_SAMPLES: CorpusSample[] = (scams as Raw[]).map(withLabel('scam'));
export const BENIGN_SAMPLES: CorpusSample[] = (benign as Raw[]).map(withLabel('benign'));
export const ALL_SAMPLES: CorpusSample[] = [...SCAM_SAMPLES, ...BENIGN_SAMPLES];

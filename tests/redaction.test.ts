import { describe, expect, it } from 'vitest';
import { ALL_SAMPLES } from '../corpus/index';
import { redactForCloud } from '../src/redaction/pipeline';
import { countTags, findLeaks, regexRedact } from '../src/redaction/regex';

/** Assert the raw value is gone and the expected tag took its place. */
function expectRedacted(input: string, secret: string, tag: string) {
  const out = regexRedact(input);
  expect(out.text, `"${secret}" leaked from: ${out.text}`).not.toContain(secret);
  expect(out.text).toContain(tag);
  expect(out.total).toBeGreaterThan(0);
}

describe('regexRedact: emails', () => {
  it.each([
    'jane.doe@example.com',
    'm_ellison+bank@mail.example.co.uk',
    'R.OKAFOR@EXAMPLE.NET',
    'first-last99@sub.domain.example.org',
  ])('redacts %s', (email) => {
    expectRedacted(`Please reply to ${email} today.`, email, '[EMAIL]');
  });

  it('redacts an email inside a link query string', () => {
    const out = regexRedact('Verify at http://bank.example/verify?user=d.whitaker@example.com&id=5 now');
    expect(out.text).not.toContain('d.whitaker');
    expect(out.text).not.toContain('user=');
    expect(out.text).toContain('http://bank.example/[LINK]');
  });
});

describe('regexRedact: phone numbers', () => {
  it.each([
    '1-888-555-0142',
    '(877) 555-0188',
    '+1 (877) 555-0188',
    '888.555.0126',
    '8885550126',
    '+1 888 555 0126',
    '207-555-0146',
    '+44 7700 900123',
    '+61 2 5550 1234',
  ])('redacts %s', (phone) => {
    expectRedacted(`Call us on ${phone} right away`, phone, '[PHONE]');
  });
});

describe('regexRedact: card numbers', () => {
  it.each([
    '4111 1111 1111 1111',
    '4111-1111-1111-1111',
    '4111111111111111',
    '5555 5555 5555 4444',
    '378282246310005',
    '6011 1111 1111 1117',
  ])('redacts Luhn-valid card %s as [CARD]', (card) => {
    expectRedacted(`My card is ${card}, exp 09/27`, card, '[CARD]');
  });

  it('redacts a 16-digit number that fails Luhn as [ACCOUNT], never leaving it in place', () => {
    const out = regexRedact('Reference 1234 5678 9012 3456 on file');
    expect(out.text).not.toMatch(/\d{4}/);
    expect(out.text).toContain('[ACCOUNT]');
  });
});

describe('regexRedact: SSN-style numbers', () => {
  it.each(['123-45-6789', '123 45 6789', '078-05-1120'])('redacts %s', (ssn) => {
    expectRedacted(`SSN on file: ${ssn}.`, ssn, '[SSN]');
  });

  it('redacts an unformatted 9-digit SSN', () => {
    const out = regexRedact('Social Security number 123456789 was suspended');
    expect(out.text).not.toContain('123456789');
  });
});

describe('regexRedact: addresses', () => {
  it.each([
    '4410 Birchwood Lane, Tulsa, OK 74105',
    '77 Harbor View Drive, Portland, ME 04101',
    '218 Maple Court',
    '1600 Pennsylvania Avenue NW',
    '12B Elm St, Apt 4',
    '901 N. Main Street, Suite 200, Springfield, IL 62701',
    'P.O. Box 4471',
    'PO Box 12',
  ])('redacts %s', (address) => {
    const out = regexRedact(`It will ship to ${address} tomorrow.`);
    expect(out.text).toContain('[ADDRESS]');
    // The street name must be gone, not merely the house number.
    const street = address.replace(/^[\dA-Za-z.]*\s+/, '').split(',')[0]!.trim();
    if (!/^P\.?O/i.test(address)) expect(out.text).not.toContain(street);
  });

  it('redacts a bare city, state and ZIP', () => {
    expectRedacted('Mailing from Tulsa, OK 74105 this week', 'Tulsa, OK 74105', '[ADDRESS]');
  });
});

describe('regexRedact: names', () => {
  it.each([
    ['Dear Margaret Ellison, thank you', 'Margaret Ellison'],
    ['Hello Robert Hanley, your plan', 'Robert Hanley'],
    ['Hi Linda, are you at your desk?', 'Linda'],
    ['Good morning Mrs. Bennett, we are calling', 'Bennett'],
    ['Thanks, David Marsh, CEO', 'David Marsh'],
    ['Account holder: Dorothy Bennett', 'Dorothy Bennett'],
    ['appointment with Dr. Alvarez on Thursday', 'Alvarez'],
    ['Notice from Mr. Daniel Reyes', 'Daniel Reyes'],
  ])('redacts the name in "%s"', (text, name) => {
    expectRedacted(text, name, '[NAME]');
  });

  it.each(['Dear Customer, your parcel', 'Hello there, welcome', 'Dear Valued Member, thanks', 'Hi Team, quick note'])(
    'leaves generic greetings alone: "%s"',
    (text) => {
      expect(regexRedact(text).counts.NAME).toBe(0);
    },
  );
});

describe('regexRedact: other identifiers', () => {
  it('redacts account numbers, tracking codes, wallets, IPs and birth dates', () => {
    const input =
      'Account 5530198842. Tracking 1Z999AA10123456784. Wallet bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh and ' +
      '0x52908400098527886E0F7030069857D2E4169EE7. From 203.0.113.42. Date of birth: 04/12/1948.';
    const out = regexRedact(input);
    for (const secret of [
      '5530198842',
      '1Z999AA10123456784',
      'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
      '0x52908400098527886E0F7030069857D2E4169EE7',
      '203.0.113.42',
      '04/12/1948',
    ]) {
      expect(out.text, `${secret} leaked`).not.toContain(secret);
    }
  });

  it('keeps the site of a link but drops its path and query', () => {
    const out = regexRedact('Pay at https://dhl-customs-release.example/pay?id=JD0146&email=a@b.example now.');
    expect(out.text).toContain('https://dhl-customs-release.example/[LINK]');
    expect(out.text).not.toContain('pay?id');
  });

  it('leaves money, dates, times and short numbers readable', () => {
    const text = 'Your bill for October is $86.20, due on November 21 at 10:30 AM. Order total $1,249.00 for 2 items.';
    const out = regexRedact(text);
    expect(out.text).toBe(text);
    expect(out.total).toBe(0);
  });
});

describe('regexRedact: properties', () => {
  it('is idempotent: a second pass finds nothing new', () => {
    for (const s of ALL_SAMPLES) {
      const once = regexRedact(s.text);
      const twice = regexRedact(once.text);
      expect(twice.total, `second pass changed ${s.id}: ${twice.text}`).toBe(0);
      expect(twice.text).toBe(once.text);
    }
  });

  it('never leaks a detected value on any corpus sample', () => {
    for (const s of ALL_SAMPLES) {
      const out = regexRedact(s.text);
      expect(findLeaks(out.text, out.found), `leak in ${s.id}`).toEqual([]);
    }
  });

  it('leaves no long digit run, email or phone number in any corpus sample', () => {
    for (const s of ALL_SAMPLES) {
      const { text } = regexRedact(s.text);
      expect(text, s.id).not.toMatch(/\d{7,}/);
      expect(text, s.id).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
      expect(text, s.id).not.toMatch(/\d{3}[\s.-]\d{3}[\s.-]\d{4}/);
    }
  });
});

describe('redactForCloud: the privacy gate', () => {
  const text =
    'Dear Margaret Ellison, your card 4111 1111 1111 1111 was charged. Call 1-855-555-0119 or write to m.ellison@example.com.';

  it('works with no model at all (regex only)', async () => {
    const out = await redactForCloud(text, null);
    expect(out.safeToSend).toBe(true);
    expect(out.usedModel).toBe(false);
    expect(out.text).not.toContain('Margaret');
    expect(out.text).not.toContain('4111');
    expect(out.text).not.toContain('555-0119');
    expect(out.text).not.toContain('example.com');
    expect(out.redactionCount).toBe(countTags(out.text));
    expect(out.redactionCount).toBeGreaterThanOrEqual(4);
  });

  it('never shows the model any structured personal data', async () => {
    let seen = '';
    await redactForCloud(text, async (pre) => {
      seen = pre;
      return pre;
    });
    expect(seen).not.toContain('4111');
    expect(seen).not.toContain('555-0119');
    expect(seen).not.toContain('m.ellison@example.com');
  });

  it('accepts a well-behaved model rewrite', async () => {
    const out = await redactForCloud('My neighbour Tobias Greenleaf said to pay. Call 1-855-555-0119.', async (pre) =>
      pre.replace('Tobias Greenleaf', '[NAME]'),
    );
    expect(out.safeToSend).toBe(true);
    expect(out.usedModel).toBe(true);
    expect(out.text).not.toContain('Tobias');
  });

  it('re-redacts anything pattern-shaped the model writes back', async () => {
    const out = await redactForCloud(text, async (pre) => `${pre} Contact 4111 1111 1111 1111 or hacker@example.org.`);
    expect(out.safeToSend).toBe(true);
    expect(out.text).not.toContain('4111');
    expect(out.text).not.toContain('hacker@example.org');
  });

  it('rejects a model that summarises instead of redacting', async () => {
    const out = await redactForCloud(text, async () => 'A scam.');
    expect(out.usedModel).toBe(false);
    expect(out.safeToSend).toBe(true);
    expect(out.text).toContain('[CARD]');
  });

  it('survives a model that throws', async () => {
    const out = await redactForCloud(text, async () => {
      throw new Error('model crashed');
    });
    expect(out.safeToSend).toBe(true);
    expect(out.usedModel).toBe(false);
  });

  it('falls back to the regex text when the model puts a removed value back', async () => {
    // "Margaret Ellison" was removed by the greeting rule; the model re-inserts it in a form no pattern catches.
    const out = await redactForCloud(text, async (pre) => pre.replace('[NAME]', 'our client margaret ellison'));
    expect(out.text).not.toContain('Margaret Ellison');
    expect(out.safeToSend).toBe(true);
    expect(out.usedModel).toBe(false);
  });

  it('lets a model rewrite through when the second regex pass cleans up what it re-inserted', async () => {
    const out = await redactForCloud(text, async (pre) => pre.replace('[NAME]', 'our client Margaret Ellison'));
    expect(out.text).not.toContain('Margaret Ellison');
    expect(out.safeToSend).toBe(true);
  });

  it('produces sendable, leak-free text for every corpus sample', async () => {
    for (const s of ALL_SAMPLES) {
      const out = await redactForCloud(s.text, null);
      expect(out.safeToSend, s.id).toBe(true);
      expect(regexRedact(out.text).total, s.id).toBe(0);
    }
  });
});

describe('names in ordinary prose, with no on-device model', () => {
  it('removes a common given name and the surname after it', () => {
    const out = regexRedact('I spoke to Margaret Ellison yesterday and she said Robert would call back.');
    expect(out.text).toBe('I spoke to [NAME] yesterday and she said [NAME] would call back.');
    expect(out.counts.NAME).toBe(2);
  });

  it('leaves companies, places and everyday words alone', () => {
    for (const keep of [
      'Your Charles Schwab account statement is ready.',
      'Call Microsoft Support or visit Wells Fargo today.',
      'Will you be home in May? Mark the date.',
      'Pay with Google Play gift cards at Walmart.',
    ]) {
      expect(regexRedact(keep).text, keep).toBe(keep);
    }
  });

  it('is stable when run twice', () => {
    const once = regexRedact("Tell Susan that Dr. Patel and James O'Neill agree.").text;
    expect(regexRedact(once).text).toBe(once);
    expect(once).not.toMatch(/Susan|Patel|James/);
  });
});

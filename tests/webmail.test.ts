import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { readVisibleText, senderDomain } from '../src/content/scan';

// jsdom has no layout, so every element counts as visible here.
const all = () => true;
const page = (url: string, body: string) => new JSDOM(`<!doctype html><body>${body}</body>`, { url }).window.document;

describe('webmail: only an opened message is read', () => {
  it('Gmail inbox list: nothing is read', () => {
    const doc = page('https://mail.google.com/mail/u/0/#inbox', '<div role="main"><tr><td>Your account is locked, call now</td></tr></div>');
    expect(readVisibleText(doc, all)).toBe('');
  });

  it('Gmail opened message: subject, body and the sender domain only', () => {
    const doc = page(
      'https://mail.google.com/mail/u/0/#inbox/abc',
      '<h2 class="hP">Account suspended</h2><span class="gD" email="security@paypa1-support.com">PayPal</span><div class="a3s">Call 1-855-555-0101 today.</div>',
    );
    const text = readVisibleText(doc, all);
    expect(text).toContain("Sender's address is at: paypa1-support.com");
    expect(text).toContain('Account suspended');
    expect(text).toContain('Call 1-855-555-0101 today.');
    expect(text).not.toContain('security@');
  });

  it('Outlook: the message body and the sender domain', () => {
    const doc = page(
      'https://outlook.live.com/mail/0/inbox/id/1',
      '<div aria-label="From: Microsoft Support"><span title="help@ms-account-alerts.net">Microsoft Support</span></div><div aria-label="Message body">Your mailbox will be closed in 24 hours.</div>',
    );
    const text = readVisibleText(doc, all);
    expect(text).toContain('Your mailbox will be closed in 24 hours.');
    expect(senderDomain(doc, 'outlook.live.com')).toBe('ms-account-alerts.net');
  });

  it('Yahoo: the message body; nothing when no message is open', () => {
    const open = page('https://mail.yahoo.com/d/folders/1/messages/2', '<span data-test-id="message-from">IRS &lt;notice@irs-refund-center.com&gt;</span><div data-test-id="message-view-body">Pay the fee with gift cards.</div>');
    expect(readVisibleText(open, all)).toContain("Sender's address is at: irs-refund-center.com");
    const inbox = page('https://mail.yahoo.com/d/folders/1', '<ul><li>Pay the fee with gift cards.</li></ul>');
    expect(readVisibleText(inbox, all)).toBe('');
  });

  it('an ordinary site is read as a page, with no sender line', () => {
    const doc = page('https://shop.example/', '<p>Free delivery on orders over $25.</p>');
    expect(readVisibleText(doc, all)).not.toContain('Sender');
  });
});

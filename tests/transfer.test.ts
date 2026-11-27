import { describe, expect, it } from 'vitest';
import type { FieldInfo } from '../src/tripwires/cardField';
import { RECENT_RISK_MS, addsNewPayee, isTransferField, riskIsRecent } from '../src/tripwires/transfer';

const field = (over: Partial<FieldInfo>): FieldInfo => ({ type: 'text', autocomplete: '', name: '', id: '', placeholder: '', ariaLabel: '', labelText: '', ...over });

describe('the money-transfer tripwire', () => {
  it('recognizes payee, recipient, routing and wire fields', () => {
    expect(isTransferField(field({ labelText: 'Payee name' }), '')).toBe(true);
    expect(isTransferField(field({ name: 'routingNumber', labelText: 'Routing number' }), '')).toBe(true);
    expect(isTransferField(field({ labelText: 'Recipient phone number' }), '')).toBe(true);
    expect(isTransferField(field({ labelText: 'Nombre del destinatario' }), '')).toBe(true);
  });
  it('counts a plain amount box only inside a form about sending money', () => {
    expect(isTransferField(field({ labelText: 'Amount' }), 'Send money to a new recipient')).toBe(true);
    expect(isTransferField(field({ labelText: 'Amount' }), 'Choose a gift card amount: $25, $50, $100')).toBe(false);
  });
  it('leaves email, note, password and gift-card boxes alone', () => {
    expect(isTransferField(field({ type: 'email', labelText: 'Recipient email' }), '')).toBe(false);
    expect(isTransferField(field({ labelText: 'Recipient email' }), '')).toBe(false);
    expect(isTransferField(field({ labelText: 'Memo to payee' }), '')).toBe(false);
    expect(isTransferField(field({ type: 'password', labelText: 'Payee' }), '')).toBe(false);
    expect(isTransferField(field({ labelText: 'Gift recipient name' }), '')).toBe(false);
  });
  it('notices a new payee being added', () => {
    expect(addsNewPayee('Transfers. Add a new payee. Name, routing number, account number')).toBe(true);
    expect(addsNewPayee('Send money to: Jane Smith (saved). Amount')).toBe(false);
  });
  it('counts a warning in the last hour as recent, and nothing older or in the future', () => {
    const now = 10 * RECENT_RISK_MS;
    expect(riskIsRecent(now - 5 * 60_000, now)).toBe(true);
    expect(riskIsRecent(now - RECENT_RISK_MS - 1, now)).toBe(false);
    expect(riskIsRecent(now + 1000, now)).toBe(false);
    expect(riskIsRecent(undefined, now)).toBe(false);
  });
});

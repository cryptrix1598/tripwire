/**
 * The transfer tripwire against field labels and headings worded the way real bank, payment and
 * checkout pages word them (written from the public patterns of US, UK, Spanish and French
 * online banking: Zelle-style "send money", wires, bill pay, IBAN payees). Not copies of any page.
 */
import { describe, expect, it } from 'vitest';
import type { FieldInfo } from '../src/tripwires/cardField';
import { addsNewPayee, isTransferField } from '../src/tripwires/transfer';

const field = (labelText: string, over: Partial<FieldInfo> = {}): FieldInfo => ({
  type: 'text', autocomplete: '', name: '', id: '', placeholder: '', ariaLabel: '', labelText, ...over,
});

const PAUSES: Array<[string, string, FieldInfo, boolean]> = [
  // [what, the form's text, the focused field, is it a new payee]
  ['send money to a new contact', 'Send money Add a recipient Enter their email or U.S. mobile number Amount Review', field('Amount', { type: 'number' }), true],
  ['a domestic wire', 'Wire transfer Recipient information Recipient’s bank routing number (ABA) Recipient account number Wire amount', field('Recipient’s bank routing number (ABA)'), false],
  ['bill pay, adding a payee', 'Bill pay Add payee Payee name Account number with payee Nickname (optional)', field('Payee name'), true],
  ['a UK new payee', 'Payments Set up a new payee Payee name Sort code Account number Reference', field('Sort code'), true],
  ['an IBAN payee', 'Transfers New beneficiary Beneficiary name IBAN BIC / SWIFT Amount', field('IBAN'), true],
  ['Spanish: a new recipient', 'Transferencias Agregar destinatario Nombre del destinatario CLABE Monto', field('Nombre del destinatario'), true],
  ['French: a new beneficiary', 'Virements Ajouter un bénéficiaire Nom du bénéficiaire IBAN du bénéficiaire Montant du virement', field('IBAN du bénéficiaire'), true],
];

const SILENT: Array<[string, string, FieldInfo]> = [
  ['a flower delivery: "Add a new recipient"', 'Send flowers Delivery details Add a new recipient Recipient name Recipient address Card message', field('Recipient name')],
  ['a shipping step: "Ship to" recipient', 'Checkout Ship to Recipient name Street address City ZIP Phone', field('Recipient name')],
  ['a Spanish delivery form', 'Datos de entrega Nombre del destinatario Dirección de envío Código postal', field('Nombre del destinatario')],
  ['a French delivery form', 'Adresse de livraison Nom du destinataire Code postal Ville', field('Nom du destinataire')],
  ['a checkout card box', 'Checkout Shipping address Payment Card number Expiration CVV Place order', field('Card number', { autocomplete: 'cc-number' })],
  ['a gift card amount on a store page', 'Gift cards Choose an amount $25 $50 $100 Add to cart', field('Gift card amount')],
  ['a donation', 'Donate to the food bank Donation amount Monthly gift', field('Donation amount')],
  ['the recipient’s email for a receipt', 'Send money Add a recipient Email or U.S. mobile number', field('Email or U.S. mobile number', { type: 'email' })],
  ['a memo line', 'Send money Memo (optional)', field('Memo (optional)')],
  ['a shipping quantity box', 'Your cart Quantity Amount saved $4.00', field('Quantity')],
];

describe('the transfer tripwire on real-world wording', () => {
  it.each(PAUSES)('pauses: %s', (_what, form, f, fresh) => {
    expect(isTransferField(f, form)).toBe(true);
    expect(addsNewPayee(form)).toBe(fresh);
  });
  it.each(SILENT)('stays silent: %s', (_what, form, f) => {
    expect(isTransferField(f, form)).toBe(false);
    if (/recipient|destinatario|destinataire/i.test(f.labelText)) expect(addsNewPayee(form)).toBe(false);
  });
});

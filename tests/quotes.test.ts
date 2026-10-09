import test from 'node:test';
import assert from 'node:assert/strict';
import {
  nextQuoteNumber,
  quoteEffectiveStatus,
  quoteStatusLabel,
  quoteToProjectDraft,
  quoteTotals,
  validateQuote,
} from '../src/utils/quotes';

test('quote totals apply quantity, unit price, and tax', () => {
  const { subtotal, total } = quoteTotals(
    [
      { quantity: 2, unitPrice: 100 },
      { quantity: 1, unitPrice: 50 },
    ],
    20
  );
  assert.equal(subtotal, 250);
  assert.equal(total, 300);
});

test('quote totals tolerate zero tax and empty lines', () => {
  assert.deepEqual(quoteTotals([], 20), { subtotal: 0, total: 0 });
  assert.deepEqual(quoteTotals([{ quantity: 3, unitPrice: 10 }], 0), { subtotal: 30, total: 30 });
});

test('quote numbers sequence per year with zero padding', () => {
  assert.equal(nextQuoteNumber([], '2026'), 'DEV-2026-0001');
  assert.equal(
    nextQuoteNumber([{ number: 'DEV-2026-0007' }, { number: 'DEV-2026-0003' }], '2026'),
    'DEV-2026-0008'
  );
  // Other years do not leak into the sequence.
  assert.equal(nextQuoteNumber([{ number: 'DEV-2025-0041' }], '2026'), 'DEV-2026-0001');
  // Malformed numbers are ignored, never crash the sequence.
  assert.equal(nextQuoteNumber([{ number: 'FAC-2026-0009' }], '2026'), 'DEV-2026-0001');
});

test('a sent quote past its validity date reads as expired', () => {
  const base = {
    id: 'q1',
    number: 'DEV-2026-0001',
    clientName: 'Client',
    items: [],
    subtotal: 0,
    taxRate: 20,
    total: 0,
    currency: 'DH',
    status: 'sent' as const,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    createdBy: 'owner@example.com',
  };
  assert.equal(quoteEffectiveStatus({ ...base, validUntil: '2026-02-01' }, '2026-03-01'), 'expired');
  assert.equal(quoteEffectiveStatus({ ...base, validUntil: '2026-04-01' }, '2026-03-01'), 'sent');
  assert.equal(quoteEffectiveStatus({ ...base }, '2026-03-01'), 'sent');
  assert.equal(
    quoteEffectiveStatus({ ...base, status: 'approved', convertedProjectId: 'proj_1' }, '2026-03-01'),
    'converted'
  );
});

test('quote validation reports client, lines, and tax problems', () => {
  const valid = {
    clientName: 'Client',
    items: [{ description: 'Paint', quantity: 2, unitPrice: 100 }],
    taxRate: 20,
  };
  assert.equal(validateQuote({ ...valid, clientName: '  ' }), 'required_client');
  assert.equal(validateQuote({ ...valid, items: [] }), 'required_field');
  assert.equal(
    validateQuote({ ...valid, items: [{ description: '  ', quantity: 1, unitPrice: 1 }] }),
    'empty_line_description'
  );
  assert.equal(
    validateQuote({ ...valid, items: [{ description: 'x', quantity: 0, unitPrice: 1 }] }),
    'invalid_amount'
  );
  assert.equal(
    validateQuote({ ...valid, items: [{ description: 'x', quantity: 1, unitPrice: -1 }] }),
    'negative_cost_amount'
  );
  assert.equal(validateQuote({ ...valid, taxRate: 150 }), 'invalid_commission');
  assert.equal(validateQuote(valid), null);
});

test('conversion builds a project draft carrying budget, client, and quote trace', () => {
  const draft = quoteToProjectDraft(
    {
      id: 'q1',
      number: 'DEV-2026-0004',
      clientName: 'Karim',
      address: 'Rue 12',
      items: [{ id: 'l1', description: 'Tiling', quantity: 10, unitPrice: 200 }],
      subtotal: 2000,
      taxRate: 20,
      total: 2400,
      currency: 'DH',
      status: 'approved',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
      createdBy: 'owner@example.com',
    },
    { email: 'Owner@Example.com', name: 'Owner' }
  );
  assert.equal(draft.budget, 2400);
  assert.equal(draft.clientName, 'Karim');
  assert.equal(draft.projectType, 'construction');
  assert.equal(draft.sourceQuoteId, 'q1');
  assert.equal(draft.sourceQuoteNumber, 'DEV-2026-0004');
  assert.equal(draft.creatorEmail, 'owner@example.com');
  assert.equal(draft.members[0].role, 'owner');
  assert.ok(draft.description.includes('DEV-2026-0004'));
});

test('quote statuses render in all three languages', () => {
  for (const status of ['draft', 'sent', 'approved', 'rejected', 'expired', 'converted'] as const) {
    for (const language of ['en', 'fr', 'ar'] as const) {
      assert.ok(quoteStatusLabel(status, language).length > 0, `${status}/${language}`);
    }
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampCommission,
  formErrorText,
  isValidEmail,
  parseStrictAmount,
  validateCostLines,
  validateDateOrder,
  validateExpense,
  validateReimbursement,
} from '../src/utils/forms';

test('expense validation reports title, amount, and commission problems', () => {
  assert.equal(validateExpense({ title: '  ', amount: 10, commission: 0 }), 'required_title');
  assert.equal(validateExpense({ title: 'Tile', amount: 0, commission: 0 }), 'invalid_amount');
  assert.equal(validateExpense({ title: 'Tile', amount: NaN, commission: 0 }), 'invalid_amount');
  assert.equal(validateExpense({ title: 'Tile', amount: -5, commission: 0 }), 'invalid_amount');
  assert.equal(validateExpense({ title: 'Tile', amount: 10, commission: 101 }), 'invalid_commission');
  assert.equal(validateExpense({ title: 'Tile', amount: 10, commission: -1 }), 'invalid_commission');
  assert.equal(validateExpense({ title: 'Tile', amount: 10, commission: NaN }), 'invalid_commission');
  assert.equal(validateExpense({ title: 'Tile', amount: 10, commission: 15 }), null);
  assert.equal(validateExpense({ title: 'Tile', amount: 10, commission: 100 }), null);
});

test('commission clamping never trusts the HTML input bounds', () => {
  assert.equal(clampCommission(150), 100);
  assert.equal(clampCommission(-20), 0);
  assert.equal(clampCommission(NaN), 0);
  assert.equal(clampCommission(12.5), 12.5);
});

test('cost lines reject empty labels and negative amounts with the offending index', () => {
  assert.deepEqual(
    validateCostLines([{ label: '  ', amount: 10 }]),
    { index: 0, code: 'empty_cost_label' }
  );
  assert.deepEqual(
    validateCostLines([{ label: 'Sand', amount: 10 }, { label: 'Bags', amount: -2 }]),
    { index: 1, code: 'negative_cost_amount' }
  );
  assert.equal(validateCostLines([{ label: 'Sand', amount: 0 }]), null);
  assert.equal(validateCostLines([]), null);
});

test('reimbursements refuse self-settlement regardless of email casing', () => {
  assert.equal(validateReimbursement({ from: '', to: 'b@x.com', amount: 5 }), 'missing_settlement_party');
  assert.equal(validateReimbursement({ from: 'A@x.com', to: 'a@X.com', amount: 5 }), 'self_settlement');
  assert.equal(validateReimbursement({ from: 'a@x.com', to: 'b@x.com', amount: 0 }), 'invalid_settlement_amount');
  assert.equal(validateReimbursement({ from: 'a@x.com', to: 'b@x.com', amount: 25 }), null);
});

test('email validation rejects bare words and accepts real addresses', () => {
  assert.equal(isValidEmail('not-an-email'), false);
  assert.equal(isValidEmail('a@b'), false);
  assert.equal(isValidEmail(' Karim@Site.COM '), true);
  assert.equal(isValidEmail(''), false);
});

test('purchase-order dates flag an expected date before the issue date', () => {
  assert.equal(validateDateOrder('2026-05-10', '2026-05-01'), 'end_before_start');
  assert.equal(validateDateOrder('2026-05-10', '2026-05-10'), null);
  assert.equal(validateDateOrder('', '2026-05-01'), null);
});

test('strict amount parsing never coerces garbage into a storable zero', () => {
  assert.ok(Number.isNaN(parseStrictAmount('')));
  assert.ok(Number.isNaN(parseStrictAmount('-100abc')));
  assert.equal(parseStrictAmount('-100'), -100);
  assert.equal(parseStrictAmount('12.5'), 12.5);
});

test('every error code renders in all three languages', () => {
  const codes = [
    'required_title',
    'invalid_amount',
    'invalid_commission',
    'empty_cost_label',
    'negative_cost_amount',
    'invalid_email',
    'self_settlement',
    'missing_settlement_party',
    'invalid_settlement_amount',
    'end_before_start',
    'required_field',
    'required_client',
    'empty_line_description',
    'required_event_title',
  ] as const;
  for (const code of codes) {
    for (const language of ['en', 'fr', 'ar'] as const) {
      assert.ok(formErrorText(code, language).length > 0, `${code}/${language}`);
    }
  }
});

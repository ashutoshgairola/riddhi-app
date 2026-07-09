import { StatementsService } from './statements.service';
import { BadRequestException } from '@nestjs/common';
import { AccountType } from '../common/enums';

// Minimal fakes for collaborators. `accounts.findAll` returns bare accounts
// with NO last4 field — last4 lives on the credit_card row, so it's resolved
// via cardRepo (see task-6 integration correction #3), not on the account.
const parser = { parse: jest.fn() };
const accounts = { findAll: jest.fn(), findOne: jest.fn() };
const transactions = { create: jest.fn(), findForAccountInRange: jest.fn() };
const cards = { updateConfig: jest.fn() };
const cardRepo = { find: jest.fn() };

const svc = new StatementsService(
  parser as any,
  accounts as any,
  transactions as any,
  cards as any,
  cardRepo as any,
);

beforeEach(() => jest.clearAllMocks());

it('rejects when neither pdf nor text is supplied', async () => {
  await expect(
    svc.parse('u1', { accountId: 'c1' } as any),
  ).rejects.toBeInstanceOf(BadRequestException);
});

it('rejects when both pdf and text are supplied', async () => {
  await expect(
    svc.parse('u1', { pdf: 'BASE64', text: 'TEXT' } as any),
  ).rejects.toBeInstanceOf(BadRequestException);
});

it('passes {pdf} straight to the parser, resolves the card by last4, classifies items', async () => {
  parser.parse.mockResolvedValue({
    last4: '1234',
    inferredType: 'card',
    period: { from: '2026-05-13', to: '2026-06-12' },
    summary: {},
    items: [
      {
        isoDate: '2026-06-01',
        amount: 499,
        direction: 'debit',
        descriptor: 'Swiggy',
        category: 'Food',
      },
    ],
  });
  accounts.findAll.mockResolvedValue([
    { id: 'c1', type: AccountType.CREDIT, institutionName: 'HDFC' },
  ]);
  cardRepo.find.mockResolvedValue([{ accountId: 'c1', last4: '1234' }]);
  transactions.findForAccountInRange.mockResolvedValue([]); // nothing existing → 'new'
  const r = await svc.parse('u1', { pdf: 'BASE64' } as any);
  expect(parser.parse).toHaveBeenCalledWith({ pdf: 'BASE64' });
  expect(cardRepo.find).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  expect(r.account.id).toBe('c1');
  expect(r.account.matchedByLast4).toBe(true);
  expect(r.items[0].verdict).toBe('new');
});

it('passes {text} straight to the parser (encrypted → on-device-extracted)', async () => {
  parser.parse.mockResolvedValue({
    last4: null,
    inferredType: 'bank',
    period: {},
    summary: {},
    items: [],
  });
  accounts.findOne.mockResolvedValue({
    id: 'b1',
    type: AccountType.SAVINGS,
    institutionName: 'ICICI',
  });
  accounts.findAll.mockResolvedValue([
    { id: 'b1', type: AccountType.SAVINGS, institutionName: 'ICICI' },
  ]);
  cardRepo.find.mockResolvedValue([]);
  transactions.findForAccountInRange.mockResolvedValue([]);
  await svc.parse('u1', { text: 'STATEMENT TEXT', accountId: 'b1' } as any);
  expect(parser.parse).toHaveBeenCalledWith({ text: 'STATEMENT TEXT' });
});

it('flags mismatch when the passed accountId differs from the parsed last4 account', async () => {
  parser.parse.mockResolvedValue({
    last4: '9999',
    inferredType: 'card',
    period: {},
    summary: {},
    items: [],
  });
  accounts.findOne.mockResolvedValue({
    id: 'c1',
    type: AccountType.CREDIT,
    institutionName: 'HDFC',
  });
  accounts.findAll.mockResolvedValue([
    { id: 'c1', type: AccountType.CREDIT, institutionName: 'HDFC' },
    { id: 'c2', type: AccountType.CREDIT, institutionName: 'ICICI' },
  ]);
  cardRepo.find.mockResolvedValue([
    { accountId: 'c1', last4: '1234' },
    { accountId: 'c2', last4: '9999' },
  ]);
  transactions.findForAccountInRange.mockResolvedValue([]);
  const r = await svc.parse('u1', { pdf: 'BASE64', accountId: 'c1' } as any);
  expect(r.account.id).toBe('c1');
  expect(r.account.mismatchWarning).toBe(true);
});

it('returns a null account with unclassified items when nothing resolves', async () => {
  parser.parse.mockResolvedValue({
    last4: null,
    inferredType: 'bank',
    period: {},
    summary: {},
    items: [
      {
        isoDate: '2026-06-01',
        amount: 100,
        direction: 'debit',
        descriptor: 'X',
        category: null,
      },
    ],
  });
  accounts.findAll.mockResolvedValue([]);
  cardRepo.find.mockResolvedValue([]);
  const r = await svc.parse('u1', { pdf: 'BASE64' } as any);
  expect(r.account.id).toBeNull();
  expect(r.account.matchedByLast4).toBe(false);
  expect(transactions.findForAccountInRange).not.toHaveBeenCalled();
  expect(r.items[0].verdict).toBe('new');
});

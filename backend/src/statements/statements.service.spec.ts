import { StatementsService } from './statements.service';
import { BadRequestException } from '@nestjs/common';
import { AccountType } from '../common/enums';

// Minimal fakes for collaborators. `accounts.findAll` returns bare accounts
// with NO last4 field — last4 lives on the credit_card row, so it's resolved
// via cardRepo (see task-6 integration correction #3), not on the account.
const parser = { parse: jest.fn() };
const accounts: any = { findAll: jest.fn(), findOne: jest.fn() };
const transactions = { create: jest.fn(), findForAccountInRange: jest.fn() };
const cards = { updateConfig: jest.fn() };
const cardRepo = { find: jest.fn() };
const categories = { findAll: jest.fn() };

const svc = new StatementsService(
  parser as any,
  accounts as any,
  transactions as any,
  cards as any,
  cardRepo as any,
  categories as any,
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

describe('StatementsService.import', () => {
  it('creates a txn per item with fingerprint, patches card override, and skips nothing extra', async () => {
    accounts.findOne.mockResolvedValue({ id: 'c1', type: AccountType.CREDIT, name: 'HDFC' });
    const importCategories = {
      findAll: jest
        .fn()
        .mockResolvedValue([{ id: 'cat-food', name: 'Food' }, { id: 'cat-other', name: 'Other' }]),
    };
    const cardRepoMock = { find: jest.fn().mockResolvedValue([]) };
    const svc2 = new StatementsService(
      parser as any,
      accounts as any,
      transactions as any,
      cards as any,
      cardRepoMock as any,
      importCategories as any,
    );
    transactions.create.mockResolvedValue({ id: 'new' });
    cards.updateConfig.mockResolvedValue({});
    const res = await svc2.import('u1', {
      accountId: 'c1', statementType: 'card',
      items: [{ isoDate: '2026-06-01', amount: 499, direction: 'debit', descriptor: 'Swiggy', category: 'Food' }],
      summary: { statementBilled: 15230.5, statementDate: '2026-06-12' },
    } as any);
    expect(res).toEqual({ imported: 1, skipped: 0 });
    const arg = transactions.create.mock.calls[0][1];
    expect(arg).toMatchObject({ amount: 499, type: 'expense', categoryId: 'cat-food', accountId: 'c1', paymentMethod: 'card' });
    expect(typeof arg.importFingerprint).toBe('string');
    expect(cards.updateConfig).toHaveBeenCalledWith('c1', 'u1', expect.objectContaining({ statementBilled: 15230.5 }));
  });

  it('bank credit → income; setBalance reconciles the account', async () => {
    accounts.findOne.mockResolvedValue({ id: 'b1', type: AccountType.SAVINGS, name: 'ICICI', balance: 100 });
    accounts.update = jest.fn().mockResolvedValue({});
    const importCategories = {
      findAll: jest
        .fn()
        .mockResolvedValue([{ id: 'cat-income', name: 'Income' }, { id: 'cat-other', name: 'Other' }]),
    };
    const cardRepoMock = { find: jest.fn().mockResolvedValue([]) };
    const svc2 = new StatementsService(
      parser as any,
      accounts as any,
      transactions as any,
      cards as any,
      cardRepoMock as any,
      importCategories as any,
    );
    transactions.create.mockResolvedValue({ id: 'n' });
    const res = await svc2.import('u1', {
      accountId: 'b1', statementType: 'bank',
      items: [{ isoDate: '2026-06-03', amount: 5000, direction: 'credit', descriptor: 'Salary', category: 'Income' }],
      setBalance: 9000,
    } as any);
    expect(res.imported).toBe(1);
    expect(transactions.create.mock.calls[0][1]).toMatchObject({ type: 'income', categoryId: 'cat-income', accountId: 'b1' });
    expect(accounts.update).toHaveBeenCalledWith('b1', 'u1', expect.objectContaining({ balance: 9000 }));
  });
});

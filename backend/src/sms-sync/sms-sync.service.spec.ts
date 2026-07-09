import { SmsSyncService } from './sms-sync.service';

describe('SmsSyncService payment method hint', () => {
  const svc = new SmsSyncService(undefined as any, undefined as any, undefined as any);
  it('tags a credit-card spend as card', () => {
    const r = svc.parse('Rs.2499 spent on ICICI Credit Card XX8830 at AMAZON on 23-04');
    expect(r.paymentMethod).toBe('card');
  });
  it('tags a UPI debit as upi', () => {
    const r = svc.parse('Rs.649 debited from HDFC Bank a/c XX4521 to SWIGGY via UPI');
    expect(r.paymentMethod).toBe('upi');
  });
  it('tags an autopay/SIP/ACH mandate as autopay', () => {
    const r = svc.parse('Rs.10000 debited via ACH E-Mandate SIP from HDFC a/c XX4521');
    expect(r.paymentMethod).toBe('autopay');
  });
});

import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AccountsService } from '../accounts/accounts.service';
import { TransactionsService } from '../transactions/transactions.service';
import { CreditCard } from '../credit-card/credit-card.entity';
import { AccountType, TransactionType } from '../common/enums';

describe('SmsSyncService.parseBatch (resolution + reverse-dedup)', () => {
  let service: SmsSyncService;
  let accounts: { findAll: jest.Mock };
  let transactions: { findForAccountInRange: jest.Mock };
  let cardRepo: { find: jest.Mock };

  beforeEach(async () => {
    accounts = { findAll: jest.fn().mockResolvedValue([]) };
    transactions = { findForAccountInRange: jest.fn().mockResolvedValue([]) };
    cardRepo = { find: jest.fn().mockResolvedValue([]) };
    const mod = await Test.createTestingModule({
      providers: [
        SmsSyncService,
        { provide: AccountsService, useValue: accounts },
        { provide: TransactionsService, useValue: transactions },
        { provide: getRepositoryToken(CreditCard), useValue: cardRepo },
      ],
    }).compile();
    service = mod.get(SmsSyncService);
  });

  const cardSms = { id: 'm1', raw: 'Rs.499 spent on HDFC Credit Card xx4521 at SWIGGY', date: Date.parse('2026-06-13T10:00:00Z') };

  it('resolves accountId for a unique last4 card match', async () => {
    accounts.findAll.mockResolvedValue([
      { id: 'acc-card', institutionName: 'HDFC Bank', type: AccountType.CREDIT },
    ]);
    cardRepo.find.mockResolvedValue([{ accountId: 'acc-card', last4: '4521' }]);
    const [item] = await service.parseBatch('u1', [cardSms]);
    expect(item.accountId).toBe('acc-card');
    expect(item.possibleDuplicate).toBe(false);
  });

  it('leaves accountId null and possibleDuplicate false when no account matches', async () => {
    const [item] = await service.parseBatch('u1', [cardSms]);
    expect(item.accountId).toBeNull();
    expect(item.possibleDuplicate).toBe(false);
    expect(transactions.findForAccountInRange).not.toHaveBeenCalled();
  });

  it('flags possibleDuplicate when a resolved account already has a matching txn', async () => {
    accounts.findAll.mockResolvedValue([
      { id: 'acc-card', institutionName: 'HDFC Bank', type: AccountType.CREDIT },
    ]);
    cardRepo.find.mockResolvedValue([{ accountId: 'acc-card', last4: '4521' }]);
    transactions.findForAccountInRange.mockResolvedValue([
      { id: 'tx1', date: '2026-06-13', amount: -499, type: TransactionType.EXPENSE, accountId: 'acc-card', description: 'Swiggy', importFingerprint: null },
    ]);
    const [item] = await service.parseBatch('u1', [cardSms]);
    expect(item.possibleDuplicate).toBe(true);
  });

  it('skips non-transaction messages (no amount)', async () => {
    const out = await service.parseBatch('u1', [{ id: 'x', raw: 'Your OTP is 4521', date: 0 }]);
    expect(out).toEqual([]);
  });
});

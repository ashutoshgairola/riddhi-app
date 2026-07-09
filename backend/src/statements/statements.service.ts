import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountsService } from '../accounts/accounts.service';
import { TransactionsService } from '../transactions/transactions.service';
import { CreditCardService } from '../credit-card/credit-card.service';
import { CreditCard } from '../credit-card/credit-card.entity';
import {
  StatementParserService,
  ParsedStatement,
  ParsedStatementSummary,
} from './statement-parser.service';
import {
  classifyLineItems,
  ClassifiedLineItem,
  ExistingTxn,
  LineDirection,
} from './statement-dedup';
import { resolveAccountByLast4, ResolvableAccount } from './account-resolve';
import { TransactionType } from '../common/enums';
import { ParseStatementDto } from './dto/parse-statement.dto';

export interface StatementParseResult {
  account: {
    id: string | null;
    matchedByLast4: boolean;
    ambiguous: boolean;
    mismatchWarning: boolean;
  };
  statementType: 'card' | 'bank';
  period: { from: string | null; to: string | null };
  summary: ParsedStatementSummary;
  items: ClassifiedLineItem[];
}

@Injectable()
export class StatementsService {
  constructor(
    private readonly parser: StatementParserService,
    private readonly accounts: AccountsService,
    private readonly transactions: TransactionsService,
    private readonly cards: CreditCardService,
    @InjectRepository(CreditCard)
    private readonly cardRepo: Repository<CreditCard>,
  ) {}

  async parse(userId: string, dto: ParseStatementDto): Promise<StatementParseResult> {
    // Exactly one input: raw PDF bytes (unencrypted) or on-device-extracted text
    // (encrypted PDF, decrypted on the phone). No decryption happens here.
    const hasPdf = typeof dto.pdf === 'string' && dto.pdf.length > 0;
    const hasText = typeof dto.text === 'string' && dto.text.length > 0;
    if (hasPdf === hasText) {
      throw new BadRequestException('Provide exactly one of pdf or text');
    }
    const parsed: ParsedStatement = await this.parser.parse(
      hasPdf ? { pdf: dto.pdf! } : { text: dto.text! },
    );

    // Resolve the target account. AccountsService.findAll() returns bare
    // accounts with no card relation — last4 lives on the credit_card row, so
    // load the user's cards and map accountId -> last4 ourselves.
    const [all, userCards] = await Promise.all([
      this.accounts.findAll(userId),
      this.cardRepo.find({ where: { userId } }),
    ]);
    const last4ByAccount = new Map(userCards.map((c) => [c.accountId, c.last4]));
    const resolvable: ResolvableAccount[] = all.map((a: any) => ({
      id: a.id,
      type: a.type,
      institutionName: a.institutionName ?? null,
      last4: last4ByAccount.get(a.id) ?? null,
    }));
    const byLast4 = resolveAccountByLast4(resolvable, parsed.last4);

    const accountId: string | null = dto.accountId ?? byLast4.accountId;
    let mismatchWarning = false;
    if (dto.accountId && byLast4.accountId && dto.accountId !== byLast4.accountId) {
      mismatchWarning = true; // launched on one card, statement is for another
    }
    if (!accountId) {
      // No implicit account and no last4 match — the caller (Sync) will ask the
      // user to pick; return items unclassified against an empty ledger.
      return {
        account: { id: null, matchedByLast4: false, ambiguous: byLast4.ambiguous, mismatchWarning: false },
        statementType: parsed.inferredType,
        period: parsed.period,
        summary: parsed.summary,
        items: classifyLineItems('none', parsed.items, []),
      };
    }

    // Dedup against the account's existing transactions in the statement period
    // (widened by the dedup window on both ends).
    const existing = await this.loadExisting(userId, accountId, parsed.period);
    const items = classifyLineItems(accountId, parsed.items, existing);

    return {
      account: {
        id: accountId,
        matchedByLast4: !dto.accountId && !!byLast4.accountId,
        ambiguous: byLast4.ambiguous,
        mismatchWarning,
      },
      statementType: parsed.inferredType,
      period: parsed.period,
      summary: parsed.summary,
      items,
    };
  }

  /** Load existing account transactions as dedup candidates. Uses the period
   * (±a few days) so we compare against the right cycle. */
  private async loadExisting(
    userId: string,
    accountId: string,
    period: { from: string | null; to: string | null },
  ): Promise<ExistingTxn[]> {
    const from = period.from
      ? new Date(Date.parse(period.from) - 5 * 86_400_000)
      : new Date(Date.now() - 90 * 86_400_000);
    const to = period.to
      ? new Date(Date.parse(period.to) + 5 * 86_400_000)
      : new Date();
    const rows = await this.transactions.findForAccountInRange(userId, accountId, from, to);
    return rows.map((t: any) => ({
      id: t.id,
      isoDate: new Date(t.date).toISOString().slice(0, 10),
      amount: Math.abs(t.amount),
      direction: this.directionOf(t, accountId),
      descriptor: t.description ?? '',
      importFingerprint: t.importFingerprint ?? null,
    }));
  }

  private directionOf(
    t: { type: TransactionType; accountId: string | null },
    accountId: string,
  ): LineDirection {
    if (t.type === TransactionType.INCOME) return 'credit';
    if (t.type === TransactionType.TRANSFER) return t.accountId === accountId ? 'debit' : 'credit';
    return 'debit'; // EXPENSE
  }
}

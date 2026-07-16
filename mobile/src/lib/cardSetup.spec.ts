import { buildCardSetupPatch } from './cardSetup';

describe('buildCardSetupPatch', () => {
  it('parses numbers and includes optional strings when present', () => {
    expect(buildCardSetupPatch({ creditLimit: '200000', statementDay: '5', network: 'Visa', last4: '4521' }))
      .toEqual({ creditLimit: 200000, statementDay: 5, network: 'Visa', last4: '4521' });
  });

  it('clamps statementDay into 1..28 and defaults blank/invalid to 1', () => {
    expect(buildCardSetupPatch({ creditLimit: '0', statementDay: '40', network: '', last4: '' }).statementDay).toBe(28);
    expect(buildCardSetupPatch({ creditLimit: '', statementDay: '', network: '', last4: '' }).statementDay).toBe(1);
    expect(buildCardSetupPatch({ creditLimit: '', statementDay: '0', network: '', last4: '' }).statementDay).toBe(1);
  });

  it('defaults blank creditLimit to 0 and omits empty optional strings', () => {
    const p = buildCardSetupPatch({ creditLimit: '', statementDay: '1', network: '', last4: '' });
    expect(p.creditLimit).toBe(0);
    expect('network' in p).toBe(false);
    expect('last4' in p).toBe(false);
  });
});

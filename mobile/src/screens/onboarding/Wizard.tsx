/**
 * Onboarding wizard — RN port of the Onboarding orchestrator
 * (project/riddhi/MobileOnboard.jsx:355-441). Completion calls
 * POST /users/me/onboarding via useAuth().completeOnboarding; PIN and
 * biometric flag are stored on-device (spec § Biometric + PIN).
 */
import { useState } from 'react';
import * as LocalAuthentication from 'expo-local-authentication';

import { useAuth } from '../../auth/AuthProvider';
import { useBiometricLabel } from '../../auth/biometricLabel';
import { useFeedback } from '../../feedback/FeedbackProvider';
import { PIN_MIN_LENGTH, savePin, setBiometricEnabled } from '../../auth/tokenStore';
import { OBDone } from './Done';
import { OBFooter, OBStep } from './obUi';
import { BANKS, OBAccounts, OBGoal, OBGoals, OBIncome, OBSecure, OBSync } from './steps';

const TOTAL = 6;

export function OnboardingWizard() {
  const { completeOnboarding, logout } = useAuth();
  const { toast } = useFeedback();
  const bioLabel = useBiometricLabel();

  const [step, setStep] = useState(0);
  const [goals, setGoals] = useState<string[]>(['track']);
  const [income, setIncome] = useState('');
  const [accounts, setAccounts] = useState<string[]>([]);
  const [sync, setSync] = useState(true);
  const [goalName, setGoalName] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [pin, setPin] = useState('');
  const [biometric, setBiometric] = useState(true);
  const [entering, setEntering] = useState(false);

  const next = () => setStep((s) => Math.min(s + 1, TOTAL));
  const back = () => {
    if (step === 0) {
      // Exiting the wizard signs the fresh account out, back to Welcome.
      void logout();
    } else {
      setStep((s) => s - 1);
    }
  };

  // Real biometric check before enabling the toggle (spec § Biometric).
  const onBiometric = async (v: boolean) => {
    if (!v) {
      setBiometric(false);
      return;
    }
    const hardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!hardware || !enrolled) {
      toast(`${bioLabel} not available on this device`, '🔒');
      return;
    }
    const res = await LocalAuthentication.authenticateAsync({ promptMessage: `Enable ${bioLabel}` });
    if (res.success) setBiometric(true);
  };

  const fmtAmt = (n: string) => (n === '' ? '—' : `₹${Number(n).toLocaleString('en-IN')}`);

  const summary = [
    { i: '🎯', l: 'Focus', v: goals.length ? `${goals.length} goal${goals.length > 1 ? 's' : ''} selected` : 'Getting started' },
    { i: '💰', l: 'Monthly income', v: fmtAmt(income) },
    { i: '🏦', l: 'Accounts', v: accounts.length ? `${accounts.length} selected` : 'Add later' },
    { i: '🌱', l: 'First goal', v: goalName ? `${goalName} · ${fmtAmt(goalTarget)}` : 'Skipped' },
    { i: '🔒', l: 'Security', v: `PIN${biometric ? ` + ${bioLabel}` : ''}` },
  ];

  const enter = async () => {
    if (entering) return;
    setEntering(true);
    try {
      await savePin(pin);
      await setBiometricEnabled(biometric);
      await completeOnboarding({
        focusGoals: goals,
        monthlyIncome: income === '' ? undefined : Number(income),
        selectedBanks: accounts.map((id) => BANKS.find((b) => b.id === id)?.n ?? id),
        smsSyncEnabled: sync,
        biometricEnabled: biometric,
        firstGoal:
          goalName && Number(goalTarget) >= 1 ? { name: goalName, targetAmount: Number(goalTarget) } : undefined,
      });
      // Success: AuthProvider flips status to signedIn and unmounts us.
    } catch {
      toast('Could not finish setup — tap to retry', '📡');
      setEntering(false);
    }
  };

  if (step >= TOTAL) {
    return <OBDone summary={summary} onEnter={enter} entering={entering} />;
  }

  const common = { step, total: TOTAL, onBack: back };

  switch (step) {
    case 0:
      return (
        <OBStep {...common} kicker="Let's personalize" title="What brings you to Riddhi?" sub="Pick all that apply — we'll shape your home screen around them."
          footer={<OBFooter canNext={goals.length > 0} label="Continue" onNext={next} />}>
          <OBGoals value={goals} onChange={setGoals} />
        </OBStep>
      );
    case 1:
      return (
        <OBStep {...common} kicker="Your baseline" title="What's your monthly income?" sub="This helps Riddhi suggest budgets and a healthy savings rate."
          footer={<OBFooter canNext={income !== ''} label="Continue" onNext={next} onSkip={next} />}>
          <OBIncome value={income} onChange={setIncome} />
        </OBStep>
      );
    case 2:
      return (
        <OBStep {...common} kicker="Your banks" title="Which banks do you use?" sub="Select the ones you use. We'll save this as a preference — you can connect them for real anytime."
          footer={
            <OBFooter
              canNext
              label={accounts.length ? `Continue with ${accounts.length}` : 'Continue'}
              onNext={next}
              onSkip={accounts.length === 0 ? next : undefined}
            />
          }>
          <OBAccounts value={accounts} onChange={setAccounts} />
        </OBStep>
      );
    case 3:
      return (
        <OBStep {...common} kicker="Automate" title="Log spends automatically" sub="Riddhi reads your bank's transaction SMS so you never type an expense again."
          footer={<OBFooter canNext label={sync ? 'Turn on auto-sync' : 'Continue'} onNext={next} />}>
          <OBSync value={sync} onChange={setSync} />
        </OBStep>
      );
    case 4:
      return (
        <OBStep {...common} kicker="Aim" title="Set your first goal" sub="A target to save toward. Pick a preset or make your own."
          footer={
            <OBFooter
              canNext
              label={goalName && Number(goalTarget) >= 1 ? 'Create goal' : 'Continue'}
              onNext={next}
              onSkip={!(goalName && Number(goalTarget) >= 1) ? next : undefined}
            />
          }>
          <OBGoal name={goalName} onName={setGoalName} target={goalTarget} onTarget={setGoalTarget} />
        </OBStep>
      );
    case 5:
      return (
        <OBStep {...common} kicker="Protect" title="Secure your money" sub={`Set a ${PIN_MIN_LENGTH}-6 digit PIN to lock the app. Add ${bioLabel} for one-tap access.`}
          footer={<OBFooter canNext={pin.length >= PIN_MIN_LENGTH} label="Finish setup" onNext={next} />}>
          <OBSecure pin={pin} onPin={setPin} biometric={biometric} onBiometric={(v) => void onBiometric(v)} />
        </OBStep>
      );
    default:
      return null;
  }
}

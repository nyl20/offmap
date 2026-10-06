'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { GoogleLogoIcon, FacebookLogoIcon } from '@phosphor-icons/react/ssr';

import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import { getBrowserSupabase } from '@/lib/supabase/client';
import styles from './sign-in-experience.module.css';

type Method = 'phone' | 'email';
type PhoneStage = 'enter-phone' | 'enter-code';
type EmailMode = 'sign-in' | 'sign-up';

const METHOD_ITEMS = [
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
];

type SignInExperienceProps = {
  next: string;
  initialError?: string | null;
};

export function SignInExperience({ next, initialError = null }: SignInExperienceProps) {
  const router = useRouter();
  const [method, setMethod] = useState<Method>('phone');
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);

  const [phone, setPhone] = useState('');
  const [phoneStage, setPhoneStage] = useState<PhoneStage>('enter-phone');
  const [code, setCode] = useState('');

  const [emailMode, setEmailMode] = useState<EmailMode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  function goToNext() {
    router.push(next);
    router.refresh();
  }

  async function handleOAuth(provider: 'google' | 'facebook') {
    setError(null);
    const supabase = getBrowserSupabase();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (oauthError) setError(oauthError.message);
  }

  async function handlePhoneSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = getBrowserSupabase();
    try {
      if (phoneStage === 'enter-phone') {
        const { error: otpError } = await supabase.auth.signInWithOtp({ phone: phone.trim() });
        if (otpError) throw otpError;
        setPhoneStage('enter-code');
      } else {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          phone: phone.trim(),
          token: code.trim(),
          type: 'sms',
        });
        if (verifyError) throw verifyError;
        goToNext();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong — try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = getBrowserSupabase();
    try {
      if (emailMode === 'sign-up') {
        const { error: signUpError } = await supabase.auth.signUp({ email: email.trim(), password });
        if (signUpError) throw signUpError;
        goToNext();
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (signInError) throw signInError;
        goToNext();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong — try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.card}>
      <div className={styles.oauthRow}>
        <button type="button" className={styles.oauthButton} onClick={() => handleOAuth('google')}>
          <GoogleLogoIcon weight="bold" size={18} />
          Continue with Google
        </button>
        <button type="button" className={styles.oauthButton} onClick={() => handleOAuth('facebook')}>
          <FacebookLogoIcon weight="fill" size={18} />
          Continue with Facebook
        </button>
      </div>

      <div className={styles.divider}>
        <span>or</span>
      </div>

      <SegmentedToggle
        items={METHOD_ITEMS}
        activeKey={method}
        onChange={(key) => {
          setMethod(key as Method);
          setError(null);
        }}
        aria-label="Sign-in method"
      />

      {method === 'phone' ? (
        <form className={styles.form} onSubmit={handlePhoneSubmit}>
          {phoneStage === 'enter-phone' ? (
            <label className={styles.field}>
              <span>Phone number</span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={styles.input}
                placeholder="+1 555 555 5555"
                required
              />
            </label>
          ) : (
            <>
              <p className={styles.hint}>We texted a code to {phone}.</p>
              <label className={styles.field}>
                <span>Verification code</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className={styles.input}
                  placeholder="123456"
                  required
                />
              </label>
            </>
          )}
          {error ? <p className={styles.error}>{error}</p> : null}
          <button type="submit" className={styles.submitButton} disabled={loading}>
            {loading ? 'Please wait…' : phoneStage === 'enter-phone' ? 'Send code' : 'Verify & sign in'}
          </button>
          {phoneStage === 'enter-code' ? (
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => {
                setPhoneStage('enter-phone');
                setCode('');
                setError(null);
              }}
            >
              Use a different number
            </button>
          ) : null}
        </form>
      ) : (
        <form className={styles.form} onSubmit={handleEmailSubmit}>
          <label className={styles.field}>
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={styles.input}
              required
            />
          </label>
          <label className={styles.field}>
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={styles.input}
              minLength={6}
              required
            />
          </label>
          {error ? <p className={styles.error}>{error}</p> : null}
          <button type="submit" className={styles.submitButton} disabled={loading}>
            {loading ? 'Please wait…' : emailMode === 'sign-up' ? 'Create account' : 'Sign in'}
          </button>
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => {
              setEmailMode((mode) => (mode === 'sign-up' ? 'sign-in' : 'sign-up'));
              setError(null);
            }}
          >
            {emailMode === 'sign-up' ? 'Already have an account? Sign in' : "Don't have an account? Create one"}
          </button>
        </form>
      )}
    </div>
  );
}

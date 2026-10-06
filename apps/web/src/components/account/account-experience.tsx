'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { UserIdentity } from '@supabase/supabase-js';

import { getBrowserSupabase } from '@/lib/supabase/client';
import styles from './account-experience.module.css';

const LINKABLE_PROVIDERS = ['google', 'facebook'] as const;

type AccountExperienceProps = {
  email: string | null;
  phone: string | null;
};

export function AccountExperience({ email, phone }: AccountExperienceProps) {
  const router = useRouter();
  const [identities, setIdentities] = useState<UserIdentity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    supabase.auth.getUserIdentities().then(({ data, error: identitiesError }) => {
      if (identitiesError) setError(identitiesError.message);
      else setIdentities(data?.identities ?? []);
    });
  }, []);

  async function handleLink(provider: 'google' | 'facebook') {
    setError(null);
    const supabase = getBrowserSupabase();
    const { error: linkError } = await supabase.auth.linkIdentity({
      provider,
      options: { redirectTo: `${window.location.origin}/account` },
    });
    if (linkError) setError(linkError.message);
  }

  async function handleUnlink(identity: UserIdentity) {
    setError(null);
    const supabase = getBrowserSupabase();
    const { error: unlinkError } = await supabase.auth.unlinkIdentity(identity);
    if (unlinkError) {
      setError(unlinkError.message);
      return;
    }
    setIdentities((prev) => prev?.filter((i) => i.identity_id !== identity.identity_id) ?? null);
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch('/api/account/delete', { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Could not delete account');
      router.push('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete account');
      setDeleting(false);
    }
  }

  const linkedProviders = new Set(identities?.map((i) => i.provider));
  const canUnlink = (identities?.length ?? 0) > 1;

  return (
    <div className={styles.card}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Signed in as</h2>
        <p className={styles.value}>{email ?? phone ?? 'Unknown'}</p>
        <form action="/auth/sign-out" method="post">
          <button type="submit" className={styles.linkButton}>
            Sign out
          </button>
        </form>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Linked sign-in methods</h2>
        {identities === null ? (
          <p className={styles.hint}>Loading…</p>
        ) : (
          <ul className={styles.identityList}>
            {identities.map((identity) => (
              <li key={identity.identity_id} className={styles.identityRow}>
                <span className={styles.identityProvider}>{identity.provider}</span>
                {canUnlink ? (
                  <button type="button" className={styles.linkButton} onClick={() => handleUnlink(identity)}>
                    Unlink
                  </button>
                ) : null}
              </li>
            ))}
            {LINKABLE_PROVIDERS.filter((p) => !linkedProviders.has(p)).map((provider) => (
              <li key={provider} className={styles.identityRow}>
                <span className={styles.identityProvider}>{provider}</span>
                <button type="button" className={styles.linkButton} onClick={() => handleLink(provider)}>
                  Link
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {error ? <p className={styles.error}>{error}</p> : null}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Delete account</h2>
        <p className={styles.hint}>
          This permanently deletes your account and everything saved to it. This can&apos;t be undone.
        </p>
        {confirmingDelete ? (
          <div className={styles.confirmRow}>
            <button type="button" className={styles.dangerButton} onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Yes, delete my account'}
            </button>
            <button type="button" className={styles.linkButton} onClick={() => setConfirmingDelete(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" className={styles.dangerButton} onClick={() => setConfirmingDelete(true)}>
            Delete account
          </button>
        )}
      </section>
    </div>
  );
}

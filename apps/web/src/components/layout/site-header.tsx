'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BellIcon, BookmarkSimpleIcon, HouseIcon, MapPinIcon, UserIcon } from '@phosphor-icons/react/ssr';

import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import { useAuth } from '@/lib/auth-context';
import styles from './site-header.module.css';

const NAV_ITEMS = [
  { key: '/', label: 'Home', href: '/', icon: <HouseIcon weight="regular" size={18} /> },
  { key: '/discover', label: 'Discover', href: '/discover', icon: <MapPinIcon weight="regular" size={18} /> },
  { key: '/saved', label: 'Saved', href: '/saved', icon: <BookmarkSimpleIcon weight="regular" size={18} /> },
];

export function SiteHeader() {
  const pathname = usePathname();
  const activeKey = pathname === '/' ? '/' : pathname.startsWith('/saved') ? '/saved' : '/discover';
  const { user, loading } = useAuth();

  return (
    <header className={styles.header}>
      <div className={`container ${styles.inner}`}>
        <Link href="/" className={styles.brandBlock}>
          <p className={styles.brand}>
            OFFMAP<span className={styles.dot}>.</span>
          </p>
          <span className={styles.brandSub}>in New York City</span>
        </Link>

        <SegmentedToggle items={NAV_ITEMS} activeKey={activeKey} aria-label="Primary" />

        <div className={styles.actions}>
          <button className={styles.iconBtn} aria-label="Notifications" type="button">
            <BellIcon weight="regular" size={18} />
          </button>
          {loading ? null : user ? (
            <Link
              href="/account"
              className={styles.iconBtn}
              aria-label="Account"
              title={user.email ?? user.phone ?? 'Signed in'}
            >
              <UserIcon weight="fill" size={18} />
            </Link>
          ) : (
            <Link href="/sign-in" className={styles.iconBtn} aria-label="Sign in">
              <UserIcon weight="regular" size={18} />
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

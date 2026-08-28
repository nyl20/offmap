'use client';

import { useEffect, useRef, useState } from 'react';
import { MagnifyingGlassIcon, XIcon } from '@phosphor-icons/react/ssr';

import styles from './search-bar.module.css';

type SearchBarProps = {
  onSearch: (term: string) => void;
  placeholder?: string;
};

const DEBOUNCE_MS = 350;

export function SearchBar({ onSearch, placeholder = 'Search events, places, vibes…' }: SearchBarProps) {
  const [value, setValue] = useState('');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => onSearch(value), DEBOUNCE_MS);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className={styles.bar}>
      <MagnifyingGlassIcon weight="regular" size={16} />
      <input
        className={styles.input}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label="Search"
      />
      {value ? (
        <button
          type="button"
          className={styles.clear}
          onClick={() => setValue('')}
          aria-label="Clear search"
        >
          <XIcon weight="bold" size={14} />
        </button>
      ) : null}
    </div>
  );
}

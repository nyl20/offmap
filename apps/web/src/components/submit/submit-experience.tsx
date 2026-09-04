'use client';

import { useState, type FormEvent } from 'react';
import { CATEGORY_IDS } from '@offmap/shared';

import {
  confirmTikTokImport,
  previewTikTokImport,
  type ExtractedField,
  type TikTokPreview,
} from '@/lib/ingestion-api';

import styles from './submit-experience.module.css';

type Stage = 'link' | 'review' | 'submitted';

// A field whose only source is a random viewer's comment (not the caption,
// and not the creator's own reply) is a suspect lead, not a confirmed one —
// see scrapers/tiktok/parseEvent.js. Surfacing the exact quote here is what
// lets a human catch a comparison-not-confirmation mistake (a top comment
// naming a DIFFERENT, similar place) before it gets submitted.
function isLowConfidence(field: ExtractedField): boolean {
  return field.source === 'comment';
}

function FieldProvenance({ field }: { field: ExtractedField }) {
  if (!isLowConfidence(field) || !field.source_quote) return null;
  return (
    <p className={styles.provenance}>
      ⚠ from a comment, not confirmed by the creator: &ldquo;{field.source_quote}&rdquo;
    </p>
  );
}

export function SubmitExperience() {
  const [stage, setStage] = useState<Stage>('link');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<TikTokPreview | null>(null);

  const [title, setTitle] = useState('');
  const [venueName, setVenueName] = useState('');
  const [address, setAddress] = useState('');
  const [category, setCategory] = useState<string>('');

  async function handlePreview(e: FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const result = await previewTikTokImport(url.trim());
      setPreview(result);
      setVenueName(result.venue_name.value ?? '');
      setAddress(result.location_text.value ?? '');
      setTitle(result.venue_name.value ?? '');
      setCategory(result.categories[0] ?? '');
      setStage('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong reading that link.');
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm(e: FormEvent) {
    e.preventDefault();
    if (!preview) return;

    setLoading(true);
    setError(null);
    try {
      await confirmTikTokImport({
        draft_id: preview.draft_id,
        title: title.trim() || venueName.trim(),
        venue_name: venueName.trim(),
        address: address.trim(),
        categories: category ? [category] : [],
        sub_categories: preview.sub_categories,
      });
      setStage('submitted');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit — try again.');
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setStage('link');
    setUrl('');
    setPreview(null);
    setError(null);
  }

  if (stage === 'submitted') {
    return (
      <div className={styles.card}>
        <p className={styles.submittedTitle}>Submitted for review</p>
        <p className={styles.submittedBody}>
          Thanks — this goes through the same moderation queue as everything else on the map before it
          shows up.
        </p>
        <button type="button" className={styles.linkButton} onClick={reset}>
          Add another
        </button>
      </div>
    );
  }

  if (stage === 'review' && preview) {
    return (
      <form className={styles.card} onSubmit={handleConfirm}>
        {preview.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- external, expiring TikTok CDN URL, not worth Next/Image optimization
          <img src={preview.thumbnail_url} alt="" className={styles.thumbnail} />
        ) : null}
        {preview.author_username ? (
          <p className={styles.author}>from @{preview.author_username}</p>
        ) : null}

        <label className={styles.field}>
          <span>Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={styles.input} />
        </label>

        <label className={styles.field}>
          <span>Place name</span>
          <input
            value={venueName}
            onChange={(e) => setVenueName(e.target.value)}
            className={styles.input}
            required
          />
          <FieldProvenance field={preview.venue_name} />
        </label>

        <label className={styles.field}>
          <span>Address</span>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className={styles.input}
            required
          />
          <FieldProvenance field={preview.location_text} />
          {preview.lat != null ? (
            <p className={styles.hint}>Located on the map (confidence {preview.geocode_confidence?.toFixed(2)})</p>
          ) : (
            <p className={styles.hint}>Couldn&apos;t place this on the map yet — check the address is specific enough.</p>
          )}
        </label>

        <label className={styles.field}>
          <span>Category</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={styles.input}>
            <option value="">Pick one…</option>
            {CATEGORY_IDS.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>

        {error ? <p className={styles.error}>{error}</p> : null}

        <div className={styles.actions}>
          <button type="button" className={styles.linkButton} onClick={reset} disabled={loading}>
            Start over
          </button>
          <button type="submit" className={styles.submitButton} disabled={loading}>
            {loading ? 'Submitting…' : 'Submit for review'}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form className={styles.card} onSubmit={handlePreview}>
      <label className={styles.field}>
        <span>TikTok link</span>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className={styles.input}
          placeholder="https://www.tiktok.com/..."
          inputMode="url"
          required
        />
      </label>
      {error ? <p className={styles.error}>{error}</p> : null}
      <button type="submit" className={styles.submitButton} disabled={loading}>
        {loading ? 'Reading…' : 'Autofill'}
      </button>
    </form>
  );
}

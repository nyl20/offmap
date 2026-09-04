// Client for data/ingestion's Express API (see data/ingestion/api/server.js)
// — a separate service from Supabase, called directly from the browser for
// the "paste a TikTok link" import flow. This is the first place the web
// app calls anything other than Supabase; see that file's /api/import/*
// routes for what runs server-side (resolve -> scrape -> LLM extract ->
// geocode -> classify, then the same upsert_venue/insert_event funnel every
// other scraper uses).

export type ExtractedField = {
  value: string | null;
  source: 'creator_poi_tag' | 'caption' | 'creator_reply' | 'comment' | 'none';
  source_quote: string | null;
  confidence: number;
};

export type TikTokPreview = {
  draft_id: number;
  source_url: string;
  thumbnail_url: string | null;
  author_username: string | null;
  venue_name: ExtractedField;
  location_text: ExtractedField;
  categories: string[];
  sub_categories: string[];
  lat: number | null;
  lng: number | null;
  geocode_confidence: number | null;
};

export type TikTokConfirmPayload = {
  draft_id: number;
  title: string;
  venue_name: string;
  address: string;
  categories: string[];
  sub_categories: string[];
  submitted_by_user_id?: string | null;
};

function apiBase(): string {
  const base = process.env.NEXT_PUBLIC_INGESTION_API_URL;
  if (!base) {
    throw new Error('NEXT_PUBLIC_INGESTION_API_URL is required — copy apps/web/.env.example to .env.local and fill it in.');
  }
  return base.replace(/\/$/, '');
}

async function parseErrorBody(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body?.error ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

export async function previewTikTokImport(url: string): Promise<TikTokPreview> {
  const res = await fetch(`${apiBase()}/api/import/tiktok/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error(await parseErrorBody(res));
  return res.json();
}

export async function confirmTikTokImport(payload: TikTokConfirmPayload): Promise<{ ok: true; venue_id: number }> {
  const res = await fetch(`${apiBase()}/api/import/tiktok/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseErrorBody(res));
  return res.json();
}

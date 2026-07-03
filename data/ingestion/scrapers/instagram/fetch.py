#!/usr/bin/env python3
"""
Fetches new posts from Instagram accounts listed in config/instagram_accounts.json.
Outputs one JSONL line per post to stdout. Progress/errors go to stderr.
Run with --dry-run to skip login, media download, and state updates.
"""

import json
import os
import sys
import time
import random
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

# Resolve paths relative to the project root (two levels up from src/instagram/)
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
CONFIG_PATH  = PROJECT_ROOT / 'config' / 'instagram_accounts.json'
STATE_PATH   = PROJECT_ROOT / 'data' / 'instagram_state.json'
MEDIA_DIR    = Path('/tmp/instagram_media')

DRY_RUN = '--dry-run' in sys.argv

# Load account list
try:
    with open(CONFIG_PATH) as f:
        config = json.load(f)
    accounts = config.get('accounts', [])
except FileNotFoundError:
    print(f'[fetch.py] ERROR: config not found at {CONFIG_PATH}', file=sys.stderr)
    sys.exit(1)

if not accounts:
    print('[fetch.py] No accounts configured — add usernames to config/instagram_accounts.json', file=sys.stderr)
    sys.exit(0)

# Load persisted state
state = {}
if STATE_PATH.exists():
    with open(STATE_PATH) as f:
        state = json.load(f)

# Credentials
ig_user = os.environ.get('INSTAGRAM_USERNAME')
ig_pass = os.environ.get('INSTAGRAM_PASSWORD')

if not ig_user or not ig_pass:
    print('[fetch.py] ERROR: INSTAGRAM_USERNAME and INSTAGRAM_PASSWORD env vars required', file=sys.stderr)
    sys.exit(1)

# Lazy import instaloader so missing install gives a clear error
try:
    import instaloader
except ImportError:
    print('[fetch.py] ERROR: instaloader not installed — run: pip install instaloader', file=sys.stderr)
    sys.exit(1)

L = instaloader.Instaloader(
    download_comments=False,
    save_metadata=False,
    post_metadata_txt_pattern='',
    compress_json=False,
    quiet=True,
)

if not DRY_RUN:
    # Prefer a saved session file (created via interactive_login) over
    # password login — avoids Instagram checkpoint challenges on new IPs.
    try:
        L.load_session_from_file(ig_user)
        print(f'[fetch.py] session loaded for @{ig_user}', file=sys.stderr)
    except FileNotFoundError:
        # No session file yet — fall back to password login
        try:
            L.login(ig_user, ig_pass)
            L.save_session_to_file()
            print(f'[fetch.py] logged in as @{ig_user} and saved session', file=sys.stderr)
        except Exception as e:
            print(f'[fetch.py] login failed: {e}', file=sys.stderr)
            print(f'[fetch.py] If you see a checkpoint error, log in at instagram.com first, then run:', file=sys.stderr)
            print(f'[fetch.py]   python3 -c "import instaloader; L=instaloader.Instaloader(); L.interactive_login(\'{ig_user}\'); L.save_session_to_file()"', file=sys.stderr)
            sys.exit(1)


def download_file(url, dest_path):
    headers = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'}
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as resp:
        with open(dest_path, 'wb') as f:
            f.write(resp.read())


def process_account(account):
    last_shortcode = state.get(account, {}).get('last_shortcode')
    newest_shortcode = None
    posts_emitted = 0
    MAX_POSTS_PER_RUN = 20

    print(f'[fetch.py] @{account}: fetching posts (last seen: {last_shortcode or "none"})', file=sys.stderr)

    try:
        profile = instaloader.Profile.from_username(L.context, account)
    except Exception as e:
        print(f'[fetch.py] @{account}: profile fetch failed — {e}', file=sys.stderr)
        return None

    for post in profile.get_posts():
        if newest_shortcode is None:
            newest_shortcode = post.shortcode

        # Stop at the last post we already processed
        if last_shortcode and post.shortcode == last_shortcode:
            break

        if posts_emitted >= MAX_POSTS_PER_RUN:
            print(f'[fetch.py] @{account}: reached {MAX_POSTS_PER_RUN}-post limit', file=sys.stderr)
            break

        media_paths = []
        media_urls  = []

        if not DRY_RUN:
            post_dir = MEDIA_DIR / f'{account}_{post.shortcode}'
            post_dir.mkdir(parents=True, exist_ok=True)

            try:
                if post.typename == 'GraphSidecar':
                    for i, node in enumerate(post.get_sidecar_nodes()):
                        if node.is_video:
                            url  = node.video_url
                            dest = post_dir / f'video_{i}.mp4'
                        else:
                            url  = node.display_url
                            dest = post_dir / f'image_{i}.jpg'
                        download_file(url, dest)
                        media_paths.append(str(dest))
                        media_urls.append(url)
                elif post.typename == 'GraphVideo':
                    url  = post.video_url
                    dest = post_dir / 'video.mp4'
                    download_file(url, dest)
                    media_paths.append(str(dest))
                    media_urls.append(url)
                else:  # GraphImage
                    url  = post.url
                    dest = post_dir / 'image.jpg'
                    download_file(url, dest)
                    media_paths.append(str(dest))
                    media_urls.append(url)
            except Exception as e:
                print(f'[fetch.py] @{account}/{post.shortcode}: media download failed — {e}', file=sys.stderr)

        record = {
            'shortcode':   post.shortcode,
            'username':    account,
            'caption':     post.caption or '',
            'timestamp':   post.date_utc.replace(tzinfo=timezone.utc).isoformat(),
            'media_type':  post.typename,
            'media_paths': media_paths,
            'media_urls':  media_urls,
            'post_url':    f'https://www.instagram.com/p/{post.shortcode}/',
        }
        print(json.dumps(record), flush=True)
        posts_emitted += 1

    print(f'[fetch.py] @{account}: {posts_emitted} new posts emitted', file=sys.stderr)
    return newest_shortcode


for i, account in enumerate(accounts):
    newest = process_account(account)

    if newest and not DRY_RUN:
        state[account] = {
            'last_shortcode': newest,
            'last_run_at': datetime.now(timezone.utc).isoformat(),
        }

    # Rate limit between accounts (skip after the last one)
    if i < len(accounts) - 1 and not DRY_RUN:
        delay = random.uniform(30, 90)
        print(f'[fetch.py] waiting {delay:.0f}s before @{accounts[i + 1]}…', file=sys.stderr)
        time.sleep(delay)

# Persist updated state
if not DRY_RUN:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(STATE_PATH, 'w') as f:
        json.dump(state, f, indent=2)
    print(f'[fetch.py] state saved to {STATE_PATH}', file=sys.stderr)

print('[fetch.py] done', file=sys.stderr)

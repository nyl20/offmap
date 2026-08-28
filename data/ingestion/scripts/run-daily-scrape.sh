#!/bin/bash
# Invoked by the com.mapapp.scrape LaunchAgent. launchd runs jobs with a
# minimal environment (no shell profile, no inherited PATH), so PATH is set
# explicitly here for node/npm (Homebrew).
#
# Mirrors MapApp/scripts/run-daily-scrape.sh, repointed at the actively-
# maintained offmap/data/ingestion pipeline (the legacy MapApp/src pipeline
# this replaced lacked local-spots.js's venue-category fix, the service-trade
# purge tooling, and the address/website enrichment passes).
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

PROJECT_ROOT="/Users/enzalimyint/Projects/MapApp/Code/MapApp/offmap/data/ingestion"
cd "$PROJECT_ROOT"

mkdir -p logs
echo "===== $(date -u +%Y-%m-%dT%H:%M:%SZ) starting daily scrape =====" >> logs/scrape.log
npm run scrape >> logs/scrape.log 2>&1
echo "===== $(date -u +%Y-%m-%dT%H:%M:%SZ) finished daily scrape =====" >> logs/scrape.log

#!/usr/bin/env bash
# DB를 날짜별로 백업하고 30개만 남긴다. 사용: DATABASE_URL=... ./scripts/backup.sh [백업폴더]
set -euo pipefail
DEST="${1:-$HOME/backups/sasahagjom}"
: "${DATABASE_URL:?DATABASE_URL이 필요해}"
mkdir -p "$DEST"
pg_dump "$DATABASE_URL" | gzip > "$DEST/sasahagjom-$(date +%F).sql.gz"
ls -1t "$DEST"/sasahagjom-*.sql.gz | tail -n +31 | xargs -r rm --

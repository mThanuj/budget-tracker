#!/bin/sh
# Nightly database backup, run by cron on the Hetzner server (not in the app
# container). Neon's free plan only keeps 6 hours of history, so this keeps
# 7 daily copies here and, optionally, in Hetzner Object Storage.
#
# Setup (once, as root on the server):
#   install -m 700 deploy/backup.sh /usr/local/bin/clearpaisa-backup
#   printf 'DATABASE_URL_UNPOOLED="postgresql://..."\n' > /etc/clearpaisa-backup.env && chmod 600 /etc/clearpaisa-backup.env
#   echo '30 21 * * * root /usr/local/bin/clearpaisa-backup >> /var/log/clearpaisa-backup.log 2>&1' > /etc/cron.d/clearpaisa-backup
# (21:30 UTC is 3:00 in India.) To restore, see docs/RESTORE.md.
set -eu

[ -f /etc/clearpaisa-backup.env ] && . /etc/clearpaisa-backup.env
: "${DATABASE_URL_UNPOOLED:?Set DATABASE_URL_UNPOOLED in /etc/clearpaisa-backup.env}"
DIR="${BACKUP_DIR:-/var/backups/clearpaisa}"
KEEP_DAYS="${KEEP_DAYS:-7}" # the privacy policy promises deleted data leaves backups within 7 days
STAMP="$(date -u +%Y-%m-%d)"
FILE="$DIR/clearpaisa-$STAMP.dump"

mkdir -p "$DIR"
chmod 700 "$DIR"
# pg_dump must be at least the server's major version; 18 reads older ones too.
docker run --rm postgres:18-alpine pg_dump --format=custom --no-owner --no-privileges "$DATABASE_URL_UNPOOLED" > "$FILE.tmp"
mv "$FILE.tmp" "$FILE"
find "$DIR" -name 'clearpaisa-*.dump' -mtime +"$((KEEP_DAYS - 1))" -delete
echo "$(date -u +%FT%TZ) backup ok: $FILE ($(du -h "$FILE" | cut -f1))"

# Off-site copy (optional): configure an rclone remote named "hetzner" for Object Storage.
if command -v rclone >/dev/null 2>&1 && rclone listremotes | grep -q '^hetzner:$'; then
  rclone copy "$FILE" "hetzner:${BACKUP_BUCKET:-clearpaisa-backups}/"
  rclone delete --min-age "${KEEP_DAYS}d" "hetzner:${BACKUP_BUCKET:-clearpaisa-backups}/"
  echo "$(date -u +%FT%TZ) off-site copy ok"
fi

#!/bin/bash
# scripts/db-backup.sh
BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DATABASE_URL=$1

if [ -z "$DATABASE_URL" ]; then
  echo "Usage: $0 <DATABASE_URL>"
  exit 1
fi

mkdir -p $BACKUP_DIR
echo "🚀 Starting backup..."
pg_dump "$DATABASE_URL" -F c -f "$BACKUP_DIR/backup_$TIMESTAMP.dump"

if [ $? -eq 0 ]; then
  echo "✅ Backup completed: $BACKUP_DIR/backup_$TIMESTAMP.dump"
  # Keep only last 4 backups
  ls -t $BACKUP_DIR/backup_*.dump | tail -n +5 | xargs -I {} rm {}
  echo "🧹 Old backups rotated."
else
  echo "❌ Backup failed!"
  exit 1
fi

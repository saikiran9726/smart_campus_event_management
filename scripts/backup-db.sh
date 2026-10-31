#!/usr/bin/env bash
# ==============================================================================
# scripts/backup-db.sh - Automated PostgreSQL Backup for Eventora Production
# Dumps the database using pg_dump inside the docker-compose postgres container.
#
# Recommended cron setup (runs every night at 02:00 AM):
# 0 2 * * * /opt/eventora/scripts/backup-db.sh >> /var/log/eventora-backup.log 2>&1
# ==============================================================================
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/eventora}"
CONTAINER_NAME="${CONTAINER_NAME:-eventora-postgres}"
POSTGRES_USER="${POSTGRES_USER:-eventora}"
POSTGRES_DB="${POSTGRES_DB:-eventora}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

TIMESTAMP="$(date +'%Y%m%d_%H%M%S')"
BACKUP_FILE="${BACKUP_DIR}/${POSTGRES_DB}_${TIMESTAMP}.dump"

echo "[$(date +'%Y-%m-%d %H:%M:%S')] Starting automated database backup for '${POSTGRES_DB}'..."

# Ensure target backup directory exists
mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

# Execute pg_dump inside the running postgres container (custom compressed format -Fc)
docker exec -t "${CONTAINER_NAME}" pg_dump \
  -U "${POSTGRES_USER}" \
  -d "${POSTGRES_DB}" \
  -F c \
  -b \
  -v > "${BACKUP_FILE}"

FILE_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "[$(date +'%Y-%m-%d %H:%M:%S')] Backup created successfully: ${BACKUP_FILE} (${FILE_SIZE})"

# Prune backups older than RETENTION_DAYS
echo "[$(date +'%Y-%m-%d %H:%M:%S')] Pruning backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -type f -name "${POSTGRES_DB}_*.dump" -mtime +"${RETENTION_DAYS}" -exec rm -f {} +
echo "[$(date +'%Y-%m-%d %H:%M:%S')] Backup rotation complete."

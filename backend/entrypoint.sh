#!/bin/sh
# Fix ownership on the uploads volume (mounted as root from previous runs)
chown -R appuser:appgroup /app/uploads 2>/dev/null || true

# Drop to non-root user and exec the command
exec su-exec appuser "$@"

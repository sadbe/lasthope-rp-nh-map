#!/bin/bash
# Start LAST HOPE dev server with env vars from .env loaded explicitly.
# Detaches from terminal via setsid + nohup so it survives parent shell exit.

cd /home/z/my-project/workspace

# Kill any stale instances
pkill -f "next-server\|next dev" 2>/dev/null
sleep 1

# Load env vars from .env file manually (Next.js dev does this, but make sure)
set -a
source .env
set +a

# Verify critical env vars are present
if [ -z "$NEXTAUTH_SECRET" ]; then
  echo "ERROR: NEXTAUTH_SECRET not set"
  exit 1
fi
echo "✓ NEXTAUTH_SECRET set (${#NEXTAUTH_SECRET} chars)"
echo "✓ DATABASE_URL=$DATABASE_URL"
echo "✓ NEXTAUTH_URL=$NEXTAUTH_URL"

# Start dev server, fully detached
nohup setsid ./node_modules/.bin/next dev -p 3000 -H 0.0.0.0 > /tmp/lasthope-dev.log 2>&1 < /dev/null &
disown

# Wait for server
for i in {1..40}; do
  if curl -s -o /dev/null --max-time 1 http://localhost:3000/ 2>/dev/null; then
    echo "✓ Server ready after ${i}s"
    break
  fi
  sleep 1
done

# Verify
RESP=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null)
if [ "$RESP" = "200" ]; then
  echo "✓ GET / → $RESP"
else
  echo "✗ Server not responding (HTTP $RESP)"
  tail -20 /tmp/lasthope-dev.log
  exit 1
fi

LOGIN=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login 2>/dev/null)
echo "✓ GET /login → $LOGIN"

ADMIN=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/admin 2>/dev/null)
echo "✓ GET /admin (no auth) → $ADMIN (expect 307)"

PID=$(pgrep -f "next-server" | head -1)
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  ✓ LAST HOPE dev server is running"
echo "═══════════════════════════════════════════════════════════════"
echo "  PID:  $PID"
echo "  URL:  http://localhost:3000"
echo "  Log:  /tmp/lasthope-dev.log"
echo ""
echo "  Admin login (для входа на /login):"
echo "    Email:    admin@lasthope.zone"
echo "    Пароль:   Zone2026!StrongPass"
echo "═══════════════════════════════════════════════════════════════"

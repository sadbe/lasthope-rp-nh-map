#!/bin/bash
# Full smoke test for the running LAST HOPE server.
set -e

BASE=http://localhost:3000

echo "═══════════════════════════════════════════════════════════════"
echo "  LAST HOPE Hardened Edition — Smoke Test"
echo "═══════════════════════════════════════════════════════════════"
echo

echo "── 1. Public endpoints ────────────────────────────────────────"
printf "  %-40s %s\n" "GET /"                        "$(curl -s -o /dev/null -w '%{http_code}' $BASE/)"
printf "  %-40s %s\n" "GET /login"                   "$(curl -s -o /dev/null -w '%{http_code}' $BASE/login)"
printf "  %-40s %s\n" "GET /admin (no auth)"         "$(curl -s -o /dev/null -w '%{http_code}' $BASE/admin) (expect 307)"
printf "  %-40s %s\n" "GET /api/markers (public)"    "$(curl -s -o /dev/null -w '%{http_code}' $BASE/api/markers)"
printf "  %-40s %s\n" "GET /api/categories"          "$(curl -s -o /dev/null -w '%{http_code}' $BASE/api/categories)"
printf "  %-40s %s\n" "DELETE /api/markers (no auth)" "$(curl -s -o /dev/null -w '%{http_code}' -X DELETE $BASE/api/markers) (expect 307)"
echo

echo "── 2. /admin redirect location ──────────────────────────────"
LOC=$(curl -s -I $BASE/admin 2>&1 | grep -i "^location:" | tr -d '\r')
echo "  $LOC"
echo

echo "── 3. Public /api/markers response ────────────────────────────"
echo "  $(curl -s $BASE/api/markers)"
echo

echo "── 4. Admin login flow ────────────────────────────────────────"
rm -f /tmp/cookies.txt
CSRF_RESP=$(curl -s -c /tmp/cookies.txt $BASE/api/auth/csrf)
CSRF_TOKEN=$(echo "$CSRF_RESP" | python3 -c "import json,sys; print(json.load(sys.stdin)['csrfToken'])")
printf "  %-40s %s\n" "1. CSRF token" "${CSRF_TOKEN:0:16}..."

SIGNIN=$(curl -s -b /tmp/cookies.txt -c /tmp/cookies.txt -X POST \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "csrfToken=$CSRF_TOKEN&email=admin@lasthope.zone&password=Zone2026!StrongPass&callbackUrl=http://localhost:3000/admin&json=true" \
  $BASE/api/auth/callback/credentials)
printf "  %-40s %s\n" "2. Sign-in response" "$SIGNIN"

SESSION=$(curl -s -b /tmp/cookies.txt $BASE/api/auth/session)
printf "  %-40s %s\n" "3. Session" "$(echo $SESSION | head -c 80)..."
echo

echo "── 5. Authenticated mutations ─────────────────────────────────"
RESP=$(curl -s -b /tmp/cookies.txt -X POST -H "Content-Type: application/json" \
  -d '{"id":"demo-anomaly-1","name":"Демо: Аномалия","cat":"anomaly","xPct":45.5,"yPct":30.2,"note":"Test marker"}' \
  $BASE/api/markers)
STATUS=$(curl -s -b /tmp/cookies.txt -X POST -H "Content-Type: application/json" \
  -d '{"id":"demo-anomaly-1","name":"Демо: Аномалия","cat":"anomaly","xPct":45.5,"yPct":30.2,"note":"Test marker"}' \
  -o /dev/null -w '%{http_code}' $BASE/api/markers)
echo "  POST /api/markers demo-anomaly-1 → $STATUS"
echo "  Body: $RESP"

curl -s -b /tmp/cookies.txt -X POST -H "Content-Type: application/json" \
  -d '{"id":"demo-artifact-1","name":"Демо: Артефакт","cat":"artifact","xPct":62.1,"yPct":48.7}' \
  -o /dev/null -w "  POST /api/markers demo-artifact-1 → %{http_code}\n" $BASE/api/markers

curl -s -b /tmp/cookies.txt -X POST -H "Content-Type: application/json" \
  -d '{"id":"demo-cat","name":"Тестовый слой","color":"#FF5733","icon":"star"}' \
  -o /dev/null -w "  POST /api/categories demo-cat → %{http_code}\n" $BASE/api/categories
echo

echo "── 6. Zod validation (negative tests) ────────────────────────"
echo "  Attempting XSS via color:"
RESP=$(curl -s -b /tmp/cookies.txt -X POST -H "Content-Type: application/json" \
  -d '{"id":"xss-cat","name":"XSS","color":"javascript:alert(1)","icon":"star"}' \
  $BASE/api/categories)
STATUS=$(curl -s -b /tmp/cookies.txt -X POST -H "Content-Type: application/json" \
  -d '{"id":"xss-cat","name":"XSS","color":"javascript:alert(1)","icon":"star"}' \
  -o /dev/null -w '%{http_code}' $BASE/api/categories)
echo "    Status: $STATUS (expect 400)"
echo "    Body: $RESP"
echo

echo "  Attempting invalid marker (empty name, xPct > 100):"
STATUS=$(curl -s -b /tmp/cookies.txt -X POST -H "Content-Type: application/json" \
  -d '{"id":"bad","name":"","cat":"anomaly","xPct":150,"yPct":30}' \
  -o /dev/null -w '%{http_code}' $BASE/api/markers)
echo "    Status: $STATUS (expect 400)"
echo

echo "── 7. Final database state ────────────────────────────────────"
curl -s $BASE/api/markers | python3 -m json.tool 2>/dev/null | head -30
echo

echo "── 8. Server process ─────────────────────────────────────────"
PID=$(pgrep -f "next-server" | head -1)
RAM=$(ps -o rss= -p $PID 2>/dev/null | awk '{print $1/1024 " MB"}')
echo "  PID: $PID, RAM: $RAM"
echo "  URL: http://localhost:3000"
echo "  Log: /tmp/lasthope.log"
echo
echo "═══════════════════════════════════════════════════════════════"
echo "  ✓ Server is up and running. Open the preview URL in browser."
echo "═══════════════════════════════════════════════════════════════"

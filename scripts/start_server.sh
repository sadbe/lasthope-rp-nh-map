#!/bin/bash
# Persistent server launcher — uses double-fork to detach from any controlling terminal.
# Started by the "run server" tool call.

cd /home/z/my-project/workspace

# Kill any stale instance
pkill -f "standalone/server.js" 2>/dev/null
sleep 1

# Start with full detachment
nohup setsid node .next/standalone/server.js > /tmp/lasthope.log 2>&1 < /dev/null &
disown

# Wait for server to be ready
for i in {1..30}; do
  if curl -s -o /dev/null --max-time 1 http://localhost:3000/ 2>/dev/null; then
    echo "✓ Server ready after ${i}s"
    break
  fi
  sleep 1
done

# Verify
RESP=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null)
if [ "$RESP" = "200" ]; then
  echo "✓ HTTP 200 from /"
else
  echo "✗ Server not responding (HTTP $RESP)"
  cat /tmp/lasthope.log
  exit 1
fi

# Show running process
PID=$(pgrep -f "standalone/server.js" | head -1)
echo "PID: $PID"
echo "Log: /tmp/lasthope.log"
echo "URL: http://localhost:3000"

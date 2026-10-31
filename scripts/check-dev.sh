#!/usr/bin/env bash
set -e

echo "=========================================================="
echo "         SMARTCAMPUS LOCAL CONNECTIVITY VERIFICATION      "
echo "=========================================================="

ALL_PASS=true

echo ""
echo "[*] Checking API /health on http://localhost:4000/health..."
HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/health || echo "000")
if [ "$HEALTH_STATUS" = "200" ]; then
  echo "    [PASS] API /health returned status 200 OK"
else
  echo "    [FAIL] API /health returned status $HEALTH_STATUS"
  ALL_PASS=false
fi

echo ""
echo "[*] Checking Web frontend on http://localhost:3000..."
WEB_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 || echo "000")
if [ "$WEB_STATUS" = "200" ]; then
  echo "    [PASS] Web frontend returned status 200 OK"
else
  echo "    [FAIL] Web frontend returned status $WEB_STATUS"
  ALL_PASS=false
fi

echo ""
echo "[*] Checking CORS OPTIONS preflight to http://localhost:4000/events with Origin: http://localhost:3000..."
CORS_HEADER=$(curl -s -I -X OPTIONS http://localhost:4000/events \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: GET" | grep -i "access-control-allow-origin" | tr -d '\r' | awk '{print $2}')

echo "    Header access-control-allow-origin: '$CORS_HEADER'"

if [ "$CORS_HEADER" = "http://localhost:3000" ] || [ "$CORS_HEADER" = "*" ]; then
  echo "    [PASS] Preflight returned correct access-control-allow-origin: $CORS_HEADER"
else
  echo "    [FAIL] Preflight missing or incorrect access-control-allow-origin header ($CORS_HEADER)"
  ALL_PASS=false
fi

echo ""
echo "----------------------------------------------------------"
if [ "$ALL_PASS" = true ]; then
  echo "[✓] ALL DEV CONNECTIVITY CHECKS PASSED"
  exit 0
else
  echo "[✗] SOME DEV CONNECTIVITY CHECKS FAILED"
  exit 1
fi

#!/bin/bash
# Sign in through the NextAuth credentials flow and keep the session cookie.
# Usage: scripts/login-helper.sh <email> <password> [callbackPath]
BASE=http://localhost:3000
COOKIE=/tmp/academy-cookies.txt
EMAIL=$1
PASSWORD=$2
CALLBACK=${3:-/admin}

rm -f "$COOKIE"

CSRF=$(curl -s -c "$COOKIE" "$BASE/api/auth/csrf" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['csrfToken'])")

curl -s -b "$COOKIE" -c "$COOKIE" -X POST "$BASE/api/auth/callback/credentials" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode "csrfToken=$CSRF" \
  --data-urlencode "email=$EMAIL" \
  --data-urlencode "password=$PASSWORD" \
  --data-urlencode "callbackUrl=$BASE$CALLBACK" \
  -o /dev/null -w "login:%{http_code}\n"

curl -s -b "$COOKIE" "$BASE/api/auth/session" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);u=d.get('user') or {};print('session:',u.get('email'),u.get('role')) if u else print('session: none')"

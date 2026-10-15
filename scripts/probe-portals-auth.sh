#!/usr/bin/env bash
# Sign in as one account per role and confirm each portal serves its own pages
# while refusing the others. Reads only; changes nothing.
set -u
BASE=${BASE:-http://localhost:3000}
PW="Academy@123"

login() {
  local email="$1" jar="$2"
  rm -f "$jar"
  local csrf
  csrf=$(curl -s -c "$jar" "$BASE/api/auth/csrf" \
    | python3 -c 'import json,sys;print(json.load(sys.stdin)["csrfToken"])')
  curl -s -b "$jar" -c "$jar" -o /dev/null -X POST "$BASE/api/auth/callback/credentials" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    --data-urlencode "csrfToken=$csrf" \
    --data-urlencode "email=$email" \
    --data-urlencode "password=$PW" \
    --data-urlencode "callbackUrl=$BASE" \
    --data-urlencode "json=true"
}

code() { curl -s -o /dev/null -w '%{http_code}' -b "$1" "$BASE$2"; }

for pair in \
  "owner@alnoor-academy.example:ADMIN" \
  "ayesha.siddiqui@alnoor-academy.example:TEACHER" \
  "hamza.hashmi1@student.alnoor-academy.example:STUDENT" \
  "tariq.mahmood1@parent.alnoor-academy.example:PARENT"
do
  email="${pair%%:*}"
  role="${pair##*:}"
  jar="/tmp/portal-jar-$role"
  login "$email" "$jar"

  echo "== $role ($email) =="
  case "$role" in
    ADMIN)
      printf '  %-30s %s\n' /admin "$(code "$jar" /admin)"
      printf '  %-30s %s\n' /admin/students "$(code "$jar" /admin/students)"
      printf '  %-30s %s\n' /admin/fees/invoices "$(code "$jar" /admin/fees/invoices)"
      printf '  %-30s %s\n' /admin/exams "$(code "$jar" /admin/exams)"
      ;;
    TEACHER)
      printf '  %-30s %s\n' /teacher "$(code "$jar" /teacher)"
      printf '  %-30s %s\n' /teacher/marks "$(code "$jar" /teacher/marks)"
      printf '  %-30s %s\n' /teacher/attendance "$(code "$jar" /teacher/attendance)"
      ;;
    STUDENT)
      printf '  %-30s %s\n' /student "$(code "$jar" /student)"
      printf '  %-30s %s\n' /student/results "$(code "$jar" /student/results)"
      printf '  %-30s %s\n' /student/fees "$(code "$jar" /student/fees)"
      ;;
    PARENT)
      printf '  %-30s %s\n' /parent "$(code "$jar" /parent)"
      printf '  %-30s %s\n' /parent/children "$(code "$jar" /parent/children)"
      printf '  %-30s %s\n' /parent/fees "$(code "$jar" /parent/fees)"
      ;;
  esac

  # Every role must be kept out of the other portals. For an administrator
  # /admin is their own portal, so it is expected to succeed.
  if [ "$role" = "ADMIN" ]; then
    printf '  %-30s %s (own portal)\n' "/admin" "$(code "$jar" /admin)"
    printf '  %-30s %s (must not be 200)\n' "cross-role /teacher" "$(code "$jar" /teacher)"
  else
    printf '  %-30s %s (must not be 200)\n' "cross-role /admin" "$(code "$jar" /admin)"
  fi
done

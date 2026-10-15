#!/usr/bin/env bash
# Probe which APIs each portal role can actually use, so portal pages are built
# against verified contracts rather than assumptions.
set -u
BASE=http://localhost:3000
PW='Academy@123'

login() {
  local email="$1" jar="$2"
  rm -f "$jar"
  local csrf
  csrf=$(curl -s -c "$jar" "$BASE/api/auth/csrf" | python3 -c 'import json,sys;print(json.load(sys.stdin)["csrfToken"])')
  curl -s -b "$jar" -c "$jar" -o /dev/null -X POST "$BASE/api/auth/callback/credentials" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    --data-urlencode "csrfToken=$csrf" \
    --data-urlencode "email=$email" \
    --data-urlencode "password=$PW" \
    --data-urlencode "callbackUrl=$BASE" \
    --data-urlencode "json=true"
}

probe() {
  local jar="$1" path="$2"
  local code body
  code=$(curl -s -o /tmp/probe-body.json -w '%{http_code}' -b "$jar" "$BASE$path")
  body=$(head -c 160 /tmp/probe-body.json)
  printf '  %-58s %s  %s\n' "$path" "$code" "$body"
}

for role in teacher student parent; do
  case "$role" in
    teacher) EMAIL='ayesha.siddiqui@alnoor-academy.example' ;;
    student) EMAIL=$(cd /workspace/project && npx tsx -e "
import { prisma } from './src/lib/prisma';
(async()=>{const s=await prisma.user.findFirst({where:{role:'STUDENT'},select:{email:true}});console.log(s?.email??'');await prisma.\$disconnect();})();
" 2>/dev/null | tail -1) ;;
    parent)  EMAIL='tariq.mahmood1@parent.alnoor-academy.example' ;;
  esac

  JAR="/tmp/jar-$role.txt"
  login "$EMAIL" "$JAR"
  echo "=== $role ($EMAIL) ==="
  for path in \
    "/api/account" \
    "/api/admin/timetable?scope=teacher" \
    "/api/admin/attendance" \
    "/api/admin/exams?scope=exams" \
    "/api/admin/announcements" \
    "/api/admin/progress" \
    "/api/admin/reports?report=attendance" \
    "/api/admin/fees" ; do
    probe "$JAR" "$path"
  done
  echo
done

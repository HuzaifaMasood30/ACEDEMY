#!/usr/bin/env bash
# Discover the real API contract available to each portal role.
set -u
BASE=http://localhost:3000

probe() {
  local jar="$1" path="$2"
  local code
  code=$(curl -s -o /tmp/pb.json -w '%{http_code}' -b "$jar" "$BASE$path")
  printf '  %-72s %s  %s\n' "$path" "$code" "$(head -c 130 /tmp/pb.json)"
}

SJAR=/tmp/jar-student.txt
PJAR=/tmp/jar-parent.txt
TJAR=/tmp/jar-teacher.txt
AJAR=/tmp/academy-cookies.txt

SID=$(curl -s -b $SJAR "$BASE/api/account" | python3 -c 'import json,sys;print(json.load(sys.stdin)["data"]["studentProfile"]["id"])')
echo "student studentId=$SID"

echo "=== STUDENT ==="
for p in \
  "/api/admin/attendance?studentId=$SID" \
  "/api/admin/timetable?scope=class" \
  "/api/admin/timetable?scope=options" \
  "/api/admin/exams?scope=resultcard&studentId=$SID" \
  "/api/admin/exams?scope=trend&studentId=$SID" \
  "/api/admin/exams?scope=marksheet" \
  "/api/admin/fees?studentId=$SID" \
  "/api/admin/announcements" \
  "/api/admin/assignments" \
  "/api/admin/resources" \
  "/api/admin/progress?scope=overview" \
  "/api/admin/progress?scope=notes&studentId=$SID" \
  "/api/admin/notifications" \
  "/api/admin/classes" ; do probe $SJAR "$p"; done

echo "=== PARENT ==="
for p in \
  "/api/admin/parents" \
  "/api/admin/parents?scope=children" \
  "/api/admin/students" \
  "/api/admin/attendance?classSectionId=x" \
  "/api/admin/fees" \
  "/api/admin/announcements" ; do probe $PJAR "$p"; done

echo "=== TEACHER ==="
for p in \
  "/api/admin/timetable?scope=teacher" \
  "/api/admin/attendance" \
  "/api/admin/assignments" \
  "/api/admin/resources" \
  "/api/admin/exams?scope=marksheet" \
  "/api/admin/progress?scope=alerts" \
  "/api/admin/classes" \
  "/api/admin/students" ; do probe $TJAR "$p"; done

echo "=== ADMIN reference ==="
for p in "/api/admin/assignments" "/api/admin/resources" "/api/admin/parents" "/api/admin/exams?scope=marksheet" ; do probe $AJAR "$p"; done

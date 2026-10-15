#!/usr/bin/env bash
# Runtime authorization audit.
#
# For each GET endpoint, compare what a non-admin role receives with what an
# administrator receives. A portal role that sees the same volume of student or
# guardian records as an administrator is reading academy-wide data, which means
# the endpoint is missing a scope filter.
set -u
BASE=http://localhost:3000

count_rows() {
  # Print a stable fingerprint: the number of top-level records returned.
  python3 -c '
import json,sys
try:
    raw = sys.stdin.read()
    d = json.loads(raw)
except Exception:
    print("n/a"); raise SystemExit
data = d.get("data")
if isinstance(data, list):
    print(len(data))
elif isinstance(data, dict):
    for key in ("records","rows","weekly","children","invoices","sessions"):
        if isinstance(data.get(key), list):
            print(len(data[key])); raise SystemExit
    print("obj:" + ",".join(sorted(data.keys())[:6]))
else:
    print("other")
'
}

probe() {
  local label="$1" jar="$2" path="$3"
  local n
  n=$(curl -s -b "$jar" "$BASE$path" | count_rows)
  printf '%-26s %-52s %s\n' "$label" "$path" "$n"
}

ENDPOINTS=(
  "/api/admin/students"
  "/api/admin/parents"
  "/api/admin/teachers"
  "/api/admin/fees"
  "/api/admin/fees/invoices"
  "/api/admin/fees/payments"
  "/api/admin/fees/structures"
  "/api/admin/attendance"
  "/api/admin/exams"
  "/api/admin/progress"
  "/api/admin/announcements"
  "/api/admin/classes"
  "/api/admin/courses"
  "/api/admin/subjects"
  "/api/admin/timetable"
  "/api/admin/admissions"
  "/api/admin/alerts"
  "/api/admin/audit"
  "/api/admin/users"
  "/api/admin/notifications"
  "/api/admin/analytics?scope=owner"
  "/api/admin/reports?report=attendance"
  "/api/admin/reports?report=fees"
)

for path in "${ENDPOINTS[@]}"; do
  printf '\n### %s\n' "$path"
  probe "ADMIN"  /tmp/academy-cookies.txt "$path"
  probe "TEACHER" /tmp/jar-teacher.txt   "$path"
  probe "STUDENT" /tmp/jar-student.txt   "$path"
  probe "PARENT"  /tmp/jar-parent.txt    "$path"
done

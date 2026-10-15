#!/usr/bin/env bash
# Cross-teacher authorization test.
#
# Picks an exam subject that the signed-in teacher is NOT assigned to and tries
# to open its marksheet. The request must be refused, and it must be refused by
# the server rather than merely hidden in the interface.
set -u

BASE=http://localhost:3000

# Exam subjects the teacher may grade, as the server reports them.
OWN=$(curl -s -b /tmp/jar-teacher.txt "$BASE/api/admin/exams?scope=myExamSubjects&pageSize=200" \
  | python3 -c "import json,sys;print('\n'.join(s['id'] for s in json.load(sys.stdin)['data']))")

# Every exam subject in the database, from the seed dump.
ALL=$(node -e "
const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();
p.examSubject.findMany({select:{id:true}}).then(r=>{console.log(r.map(x=>x.id).join('\n'));return p.\$disconnect()});
")

FOREIGN=$(comm -13 <(echo "$OWN" | sort) <(echo "$ALL" | sort) | head -1)

echo "teacher can grade : $(echo "$OWN" | wc -l) subject(s)"
echo "foreign subject   : $FOREIGN"

if [ -z "$FOREIGN" ]; then
  echo "SKIP: teacher is assigned to every exam subject, nothing foreign to test."
  exit 0
fi

echo "--- opening a foreign marksheet (expect 403) ---"
curl -s -o /tmp/cross.json -w "status=%{http_code}\n" \
  -b /tmp/jar-teacher.txt "$BASE/api/admin/exams?scope=marksheet&examSubjectId=$FOREIGN"
cat /tmp/cross.json
echo

echo "--- opening an own marksheet (expect 200) ---"
FIRST=$(echo "$OWN" | head -1)
curl -s -o /dev/null -w "status=%{http_code}\n" \
  -b /tmp/jar-teacher.txt "$BASE/api/admin/exams?scope=marksheet&examSubjectId=$FIRST"

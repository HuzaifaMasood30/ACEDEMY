"""Fix react/no-unescaped-entities errors and a stale import.

Prose apostrophes in JSX text are replaced with the typographic right single
quote (U+2019), which is both the correct character for display text and
accepted by the rule, rather than adding &apos; noise to user-facing copy.
"""

EDITS = {
    'src/app/admin/fees/dues/dues-client.tsx': [
        ("student's guardian record.", "student\u2019s guardian record."),
    ],
    'src/app/admin/notifications/notifications-client.tsx': [
        ("of the last 24 hours' messages were", "of the last 24 hours\u2019 messages were"),
    ],
    'src/app/admin/parents/parents-client.tsx': [
        ("cannot access this child's", "cannot access this child\u2019s"),
    ],
    # The suite drives markAttendance and reads the resulting jobs, so the queue
    # helper is never called directly here.
    'tests/attendance.integration.test.ts': [
        ("import { markAttendance, attendanceSummary, consecutiveAbsences, queueAbsenceNotifications }",
         "import { markAttendance, attendanceSummary, consecutiveAbsences }"),
    ],
}

for path, replacements in EDITS.items():
    text = open(path, encoding='utf-8').read()
    for old, new in replacements:
        if old not in text:
            raise SystemExit(f'not found in {path}: {old!r}')
        text = text.replace(old, new)
    open(path, 'w', encoding='utf-8').write(text)
    print('patched', path)

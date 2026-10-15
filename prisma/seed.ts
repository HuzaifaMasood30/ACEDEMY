/**
 * Development seed.
 *
 * Creates a fully populated academy so every screen has realistic data.
 * Idempotent: re-running clears the demo tables first. NEVER run against a
 * production database — it deletes data.
 */
import { PrismaClient, Role, UserStatus, Gender, GuardianRelation } from '@prisma/client';
import bcrypt from 'bcryptjs';
import 'dotenv/config';

const prisma = new PrismaClient();

const SEED_PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? 'Academy@123';

const DAY_MS = 86_400_000;

function dateOnly(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function daysAgo(n: number): Date {
  return dateOnly(new Date(Date.now() - n * DAY_MS));
}

function daysAhead(n: number): Date {
  return dateOnly(new Date(Date.now() + n * DAY_MS));
}

/** Deterministic pseudo-random so repeated seeds look the same. */
let seedState = 42;
function rand(): number {
  seedState = (seedState * 1103515245 + 12345) % 2147483648;
  return seedState / 2147483648;
}
function pick<T>(items: T[]): T {
  return items[Math.floor(rand() * items.length)];
}
function randInt(min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}

async function clearDemoData() {
  console.log('  Clearing existing demo data…');

  // Deletion order respects foreign keys.
  await prisma.$transaction([
    prisma.notificationLog.deleteMany(),
    prisma.notificationJob.deleteMany(),
    prisma.announcementRead.deleteMany(),
    prisma.announcement.deleteMany(),
    prisma.messageTemplate.deleteMany(),
    prisma.notificationPreference.deleteMany(),
    prisma.studentAlert.deleteMany(),
    prisma.progressNote.deleteMany(),
    prisma.warningRule.deleteMany(),
    prisma.examResultAudit.deleteMany(),
    prisma.recheckRequest.deleteMany(),
    prisma.examResult.deleteMany(),
    prisma.examInvigilation.deleteMany(),
    prisma.examSubject.deleteMany(),
    prisma.exam.deleteMany(),
    prisma.gradeBand.deleteMany(),
    prisma.gradeScale.deleteMany(),
    prisma.assignmentSubmission.deleteMany(),
    prisma.assignment.deleteMany(),
    prisma.learningResource.deleteMany(),
    prisma.attendanceCorrectionRequest.deleteMany(),
    prisma.attendanceRecord.deleteMany(),
    prisma.attendanceSession.deleteMany(),
    prisma.studentCheckIn.deleteMany(),
    prisma.staffAttendance.deleteMany(),
    prisma.leaveRequest.deleteMany(),
    prisma.timetableSlot.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.feeAdjustment.deleteMany(),
    prisma.invoiceItem.deleteMany(),
    prisma.invoice.deleteMany(),
    prisma.studentFeePlan.deleteMany(),
    prisma.feeStructureItem.deleteMany(),
    prisma.feeStructure.deleteMany(),
    prisma.certificate.deleteMany(),
    prisma.document.deleteMany(),
    prisma.studentStatusHistory.deleteMany(),
    prisma.guardianLink.deleteMany(),
    prisma.enrollment.deleteMany(),
    prisma.admissionApplication.deleteMany(),
    prisma.teacherSubject.deleteMany(),
    prisma.classSubject.deleteMany(),
    prisma.batch.deleteMany(),
    prisma.classSection.deleteMany(),
    prisma.courseSubject.deleteMany(),
    prisma.teacherProfile.deleteMany(),
    prisma.student.deleteMany(),
    prisma.course.deleteMany(),
    prisma.subject.deleteMany(),
    prisma.room.deleteMany(),
    prisma.term.deleteMany(),
    prisma.holiday.deleteMany(),
    prisma.academicSession.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.session.deleteMany(),
    prisma.passwordResetToken.deleteMany(),
    prisma.permissionGrant.deleteMany(),
    prisma.user.deleteMany(),
    prisma.setting.deleteMany(),
    prisma.whatsAppAccount.deleteMany(),
    prisma.backgroundJobRun.deleteMany(),
    prisma.systemEvent.deleteMany(),
    prisma.campus.deleteMany(),
  ]);
}

async function main() {
  console.log('\n🌱 Seeding the academy database\n');

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);

  await clearDemoData();
  console.log('  ✓ cleared');

  // -------------------------------------------------------------------------
  // Campus, settings and grading
  // -------------------------------------------------------------------------

  const campus = await prisma.campus.create({
    data: {
      name: 'Wisdom Academy — Main Campus',
      code: 'MAIN',
      address: '24 Knowledge Avenue, Gulberg III, Lahore',
      phone: '+924211122334',
      email: 'office@wisdom-academy.example',
    },
  });

  await prisma.setting.createMany({
    data: [
      {
        key: 'academy.profile',
        category: 'general',
        value: {
          name: 'Wisdom Academy',
          tagline: 'Building confident learners since 1998',
          email: 'office@wisdom-academy.example',
          phone: '+924211122334',
          address: '24 Knowledge Avenue, Gulberg III, Lahore',
          website: 'https://wisdom-academy.example',
        },
      },
      {
        key: 'academy.attendance_rules',
        category: 'academic',
        value: {
          minimumPercentage: 75,
          consecutiveAbsenceThreshold: 3,
          editWindowDays: 3,
          requireApprovalForEdits: true,
          notifyGuardiansOnAbsence: true,
          notifyOnLateArrival: false,
        },
      },
      {
        key: 'academy.fee_rules',
        category: 'finance',
        value: {
          invoicePrefix: 'INV',
          receiptPrefix: 'RCP',
          lateFeeGraceDays: 7,
          lateFeeAmount: 500,
          lateFeeIsPercentage: false,
          reminderOffsetsDays: [-7, -3, 0, 3, 7],
        },
      },
      {
        key: 'academy.notification_rules',
        category: 'communication',
        value: {
          absenceNotificationsEnabled: true,
          resultNotificationsEnabled: true,
          feeReminderEnabled: true,
          examReminderEnabled: true,
          examReminderLeadDays: 2,
          bulkRateLimitPerHour: 300,
          respectQuietHours: true,
        },
      },
      {
        key: 'academy.academic_rules',
        category: 'academic',
        value: {
          passingPercentage: 40,
          promotionMinimumAttendance: 75,
          promotionMinimumPercentage: 40,
          studentIdPrefix: 'STD',
          duplicateDetectionFields: ['firstName', 'lastName', 'dateOfBirth'],
        },
      },
      {
        key: 'academy.grading_defaults',
        category: 'academic',
        value: {
          defaultScaleName: 'Standard Percentage',
          showRankInResults: true,
          roundToDecimals: 2,
        },
      },
    ],
  });

  const gradeScale = await prisma.gradeScale.create({
    data: {
      name: 'Standard Percentage',
      isDefault: true,
      bands: {
        create: [
          { grade: 'A+', minPercent: 90, maxPercent: 100, gpa: 4.0, remark: 'Outstanding' },
          { grade: 'A', minPercent: 80, maxPercent: 89.99, gpa: 3.7, remark: 'Excellent' },
          { grade: 'B', minPercent: 70, maxPercent: 79.99, gpa: 3.3, remark: 'Very good' },
          { grade: 'C', minPercent: 60, maxPercent: 69.99, gpa: 3.0, remark: 'Good' },
          { grade: 'D', minPercent: 50, maxPercent: 59.99, gpa: 2.5, remark: 'Satisfactory' },
          { grade: 'E', minPercent: 40, maxPercent: 49.99, gpa: 2.0, remark: 'Pass' },
          { grade: 'F', minPercent: 0, maxPercent: 39.99, gpa: 0, remark: 'Needs improvement' },
        ],
      },
    },
  });

  await prisma.whatsAppAccount.create({
    data: {
      label: 'Academy main line (simulation)',
      phoneNumberId: 'mock-phone-number-id',
      displayNumber: '+92 421 1122334',
      mode: 'MOCK',
      qualityRating: 'GREEN',
    },
  });

  await prisma.warningRule.createMany({
    data: [
      { code: 'LOW_ATTENDANCE', name: 'Low attendance', description: 'Attendance below the academy threshold', threshold: 75, severity: 'WARNING' },
      { code: 'CONSECUTIVE_ABSENCE', name: 'Repeated consecutive absence', threshold: 3, severity: 'WARNING' },
      { code: 'DECLINING_MARKS', name: 'Declining marks', description: 'Falling results across three assessments', severity: 'WARNING' },
      { code: 'MISSING_ASSIGNMENTS', name: 'Repeated missing assignments', threshold: 3, severity: 'WARNING' },
      { code: 'WEAK_SUBJECTS', name: 'Subjects below 50%', threshold: 50, severity: 'INFO' },
      { code: 'OVERDUE_FEES', name: 'Overdue fees', severity: 'WARNING' },
    ],
  });

  // -------------------------------------------------------------------------
  // Message templates
  // -------------------------------------------------------------------------

  const { DEFAULT_TEMPLATES } = await import('../src/server/notifications/templates');

  await prisma.messageTemplate.createMany({
    data: Object.values(DEFAULT_TEMPLATES).map((template) => ({
      key: template.key,
      channel: 'WHATSAPP' as const,
      locale: 'en',
      category: template.category as never,
      name: template.name,
      body: template.body,
      variables: template.variables,
      // Only the absence alert ships pre-approved so the demo queue can send.
      isApproved: template.key === 'absence_alert',
      providerTemplateName: null,
      isActive: true,
    })),
  });

  // -------------------------------------------------------------------------
  // Academic session, terms, holidays
  // -------------------------------------------------------------------------

  const session = await prisma.academicSession.create({
    data: {
      name: '2026–2027',
      code: '2026-27',
      startDate: daysAgo(60),
      endDate: daysAhead(240),
      isCurrent: true,
      campusId: campus.id,
    },
  });

  const [term1, term2] = await Promise.all([
    prisma.term.create({
      data: {
        academicSessionId: session.id,
        name: 'Term 1',
        sequence: 1,
        startDate: daysAgo(60),
        endDate: daysAhead(60),
        isCurrent: true,
      },
    }),
    prisma.term.create({
      data: {
        academicSessionId: session.id,
        name: 'Term 2',
        sequence: 2,
        startDate: daysAhead(61),
        endDate: daysAhead(180),
      },
    }),
  ]);

  await prisma.holiday.createMany({
    data: [
      { name: 'Independence Day', date: daysAhead(20), description: 'Academy closed' },
      { name: 'Mid-term break', date: daysAhead(35), endDate: daysAhead(39), description: 'Five-day break' },
      { name: 'Founder\'s Day', date: daysAhead(75) },
    ],
  });

  // -------------------------------------------------------------------------
  // Rooms
  // -------------------------------------------------------------------------

  const rooms = await Promise.all(
    [
      { name: 'Room 101', code: 'R101', capacity: 40 },
      { name: 'Room 102', code: 'R102', capacity: 40 },
      { name: 'Room 201', code: 'R201', capacity: 35 },
      { name: 'Science Lab', code: 'LAB1', capacity: 30 },
      { name: 'Computer Lab', code: 'LAB2', capacity: 30 },
    ].map((room) => prisma.room.create({ data: { ...room, campusId: campus.id } })),
  );

  // -------------------------------------------------------------------------
  // Subjects
  // -------------------------------------------------------------------------

  const subjectDefs = [
    { code: 'MATH', name: 'Mathematics', credits: 4 },
    { code: 'ENG', name: 'English', credits: 4 },
    { code: 'PHY', name: 'Physics', credits: 3 },
    { code: 'CHEM', name: 'Chemistry', credits: 3 },
    { code: 'BIO', name: 'Biology', credits: 3 },
    { code: 'CS', name: 'Computer Science', credits: 3 },
    { code: 'URDU', name: 'Urdu', credits: 2 },
    { code: 'ISL', name: 'Islamic Studies', credits: 2 },
    { code: 'GK', name: 'General Knowledge', credits: 2 },
  ];

  const subjects = await Promise.all(
    subjectDefs.map((s) => prisma.subject.create({ data: s })),
  );
  const subjectByCode = new Map(subjects.map((s) => [s.code, s]));

  // -------------------------------------------------------------------------
  // Courses
  // -------------------------------------------------------------------------

  const courseDefs = [
    {
      code: 'MATRIC-SCI',
      name: 'Matriculation — Science',
      description: 'Two-year secondary programme covering mathematics, sciences and languages, preparing students for board examinations.',
      durationWeeks: 96,
      baseFee: 8500,
      feeFrequency: 'MONTHLY' as const,
      certificateEligible: true,
      subjects: ['MATH', 'ENG', 'PHY', 'CHEM', 'BIO', 'URDU', 'ISL'],
    },
    {
      code: 'MATRIC-ART',
      name: 'Matriculation — Arts',
      description: 'Secondary programme with a humanities focus, including languages, general knowledge and Islamic studies.',
      durationWeeks: 96,
      baseFee: 7000,
      feeFrequency: 'MONTHLY' as const,
      certificateEligible: true,
      subjects: ['MATH', 'ENG', 'GK', 'URDU', 'ISL'],
    },
    {
      code: 'FSC-PRE',
      name: 'FSc Pre-Engineering',
      description: 'Intermediate programme in mathematics, physics and chemistry for students targeting engineering degrees.',
      durationWeeks: 96,
      baseFee: 11500,
      feeFrequency: 'MONTHLY' as const,
      certificateEligible: true,
      subjects: ['MATH', 'ENG', 'PHY', 'CHEM', 'ISL'],
    },
    {
      code: 'ENTRY-TEST',
      name: 'Medical Entry Test Preparation',
      description: 'Intensive preparation course for medical college entrance examinations, covering biology, chemistry and physics.',
      durationWeeks: 24,
      baseFee: 15000,
      feeFrequency: 'QUARTERLY' as const,
      certificateEligible: false,
      subjects: ['BIO', 'CHEM', 'PHY', 'ENG'],
    },
    {
      code: 'CS-BOOTCAMP',
      name: 'Computer Science Bootcamp',
      description: 'Short practical course introducing programming, problem solving and computer fundamentals.',
      durationWeeks: 12,
      baseFee: 12000,
      feeFrequency: 'ONE_TIME' as const,
      certificateEligible: true,
      subjects: ['CS', 'MATH', 'ENG'],
    },
  ];

  const courses = [];
  for (const def of courseDefs) {
    const course = await prisma.course.create({
      data: {
        code: def.code,
        name: def.name,
        description: def.description,
        durationWeeks: def.durationWeeks,
        baseFee: def.baseFee,
        feeFrequency: def.feeFrequency,
        certificateEligible: def.certificateEligible,
        courseSubjects: {
          create: def.subjects.map((code, index) => ({
            subjectId: subjectByCode.get(code)!.id,
            sequence: index,
          })),
        },
      },
    });
    courses.push(course);
  }

  // -------------------------------------------------------------------------
  // Users: admin, teachers, students, parents
  // -------------------------------------------------------------------------

  const admin = await prisma.user.create({
    data: {
      email: 'owner@wisdom-academy.example',
      passwordHash,
      name: 'Imran Khalid',
      role: Role.ADMIN,
      status: UserStatus.ACTIVE,
      phone: '+923001234001',
      campusId: campus.id,
      emailVerified: new Date(),
    },
  });

  await prisma.user.create({
    data: {
      email: 'registrar@wisdom-academy.example',
      passwordHash,
      name: 'Sadia Rehman',
      role: Role.ADMIN,
      status: UserStatus.ACTIVE,
      phone: '+923001234002',
      campusId: campus.id,
      emailVerified: new Date(),
    },
  });

  const teacherDefs = [
    { name: 'Ayesha Siddiqui', email: 'ayesha.siddiqui@wisdom-academy.example', designation: 'Senior Teacher', department: 'Mathematics', subjects: ['MATH'], maxPeriods: 26 },
    { name: 'Bilal Ahmed', email: 'bilal.ahmed@wisdom-academy.example', designation: 'Teacher', department: 'Languages', subjects: ['ENG', 'URDU'], maxPeriods: 24 },
    { name: 'Fatima Noor', email: 'fatima.noor@wisdom-academy.example', designation: 'Senior Teacher', department: 'Sciences', subjects: ['PHY', 'CHEM'], maxPeriods: 24 },
    { name: 'Hassan Raza', email: 'hassan.raza@wisdom-academy.example', designation: 'Teacher', department: 'Sciences', subjects: ['BIO', 'CHEM'], maxPeriods: 22 },
    { name: 'Nida Aslam', email: 'nida.aslam@wisdom-academy.example', designation: 'Teacher', department: 'Computer Science', subjects: ['CS'], maxPeriods: 20 },
    { name: 'Kamran Yousuf', email: 'kamran.yousuf@wisdom-academy.example', designation: 'Teacher', department: 'Humanities', subjects: ['ISL', 'GK'], maxPeriods: 20 },
  ];

  const teachers = [];
  for (const [index, def] of teacherDefs.entries()) {
    const user = await prisma.user.create({
      data: {
        email: def.email,
        passwordHash,
        name: def.name,
        role: Role.TEACHER,
        status: UserStatus.ACTIVE,
        phone: `+9230012341${String(index + 10).padStart(2, '0')}`,
        campusId: campus.id,
        emailVerified: new Date(),
      },
    });

    const profile = await prisma.teacherProfile.create({
      data: {
        userId: user.id,
        employeeCode: `EMP-${String(index + 1).padStart(4, '0')}`,
        designation: def.designation,
        department: def.department,
        qualification: pick(['MSc', 'MA', 'MPhil', 'BSc (Hons)']),
        specialization: def.department,
        joiningDate: daysAgo(randInt(200, 1500)),
        maxWeeklyPeriods: def.maxPeriods,
        teacherSubjects: {
          create: def.subjects.map((code) => ({ subjectId: subjectByCode.get(code)!.id })),
        },
      },
    });

    teachers.push({ ...def, user, profile });
  }

  // -------------------------------------------------------------------------
  // Class sections
  // -------------------------------------------------------------------------

  const classDefs = [
    { name: 'Grade 9 — A', courseCode: 'MATRIC-SCI', gradeLevel: 'Grade 9', section: 'A', capacity: 35, teacherIndex: 0 },
    { name: 'Grade 9 — B', courseCode: 'MATRIC-SCI', gradeLevel: 'Grade 9', section: 'B', capacity: 35, teacherIndex: 1 },
    { name: 'Grade 10 — A', courseCode: 'MATRIC-SCI', gradeLevel: 'Grade 10', section: 'A', capacity: 35, teacherIndex: 2 },
    { name: 'Grade 11 — Pre-Engineering', courseCode: 'FSC-PRE', gradeLevel: 'Grade 11', section: 'A', capacity: 30, teacherIndex: 3 },
    { name: 'Entry Test — Evening', courseCode: 'ENTRY-TEST', gradeLevel: 'Entry Test', section: 'E', capacity: 25, teacherIndex: 4 },
    { name: 'CS Bootcamp — Morning', courseCode: 'CS-BOOTCAMP', gradeLevel: 'Short Course', section: 'M', capacity: 20, teacherIndex: 4 },
  ];

  const classSections = [];
  for (const def of classDefs) {
    const course = courses.find((c) => c.code === def.courseCode)!;
    const courseSubjects = await prisma.courseSubject.findMany({
      where: { courseId: course.id },
      select: { subjectId: true },
    });

    const classSection = await prisma.classSection.create({
      data: {
        name: def.name,
        courseId: course.id,
        academicSessionId: session.id,
        campusId: campus.id,
        gradeLevel: def.gradeLevel,
        sectionLetter: def.section,
        capacity: def.capacity,
        classTeacherId: teachers[def.teacherIndex].profile.id,
        classSubjects: {
          create: courseSubjects.map((cs, index) => ({
            subjectId: cs.subjectId,
            weeklyPeriods: index < 3 ? 6 : 4,
          })),
        },
      },
    });

    classSections.push(classSection);
  }

  // -------------------------------------------------------------------------
  // Students
  // -------------------------------------------------------------------------

  const firstNames = [
    'Ahmed', 'Ayesha', 'Bilal', 'Dania', 'Emaan', 'Faizan', 'Ghazal', 'Hamza',
    'Iqra', 'Junaid', 'Kiran', 'Laiba', 'Mariam', 'Noor', 'Omar', 'Priya',
    'Qasim', 'Rida', 'Saad', 'Tania', 'Usman', 'Varda', 'Waleed', 'Yusra',
    'Zainab', 'Zohaib', 'Areeba', 'Danish', 'Faria', 'Hira',
  ];
  const lastNames = [
    'Khan', 'Malik', 'Sheikh', 'Butt', 'Chaudhry', 'Hashmi', 'Iqbal', 'Javed',
    'Qureshi', 'Raza', 'Siddiqui', 'Tariq', 'Usmani', 'Zafar',
  ];

  interface SeededStudent {
    student: { id: string; firstName: string; lastName: string; admissionNo: string };
    classSectionId: string;
    userId: string;
  }

  const students: SeededStudent[] = [];
  let admissionCounter = 1;

  for (const [classIndex, classSection] of classSections.entries()) {
    // Fewer students in the short courses, more in the main grades.
    const count = classIndex < 3 ? randInt(12, 16) : classIndex === 3 ? 10 : 8;

    for (let i = 0; i < count; i += 1) {
      const firstName = firstNames[(admissionCounter * 7 + i * 3) % firstNames.length];
      const lastName = lastNames[(admissionCounter * 5 + i) % lastNames.length];
      const admissionNo = `STD-2026-${String(admissionCounter).padStart(4, '0')}`;
      const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${admissionCounter}@student.wisdom-academy.example`;

      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          name: `${firstName} ${lastName}`,
          role: Role.STUDENT,
          status: UserStatus.ACTIVE,
          campusId: campus.id,
          emailVerified: new Date(),
        },
      });

      const student = await prisma.student.create({
        data: {
          userId: user.id,
          admissionNo,
          rollNo: String(i + 1).padStart(2, '0'),
          firstName,
          lastName,
          gender: i % 2 === 0 ? Gender.MALE : Gender.FEMALE,
          dateOfBirth: daysAgo(randInt(4200, 6300)),
          bloodGroup: pick(['A+', 'B+', 'O+', 'AB+', 'O-']),
          email,
          phone: `+9230${String(randInt(1000000, 9999999))}`,
          address: `${randInt(1, 400)} ${pick(['Model Town', 'Gulberg', 'DHA Phase 4', 'Johar Town'])}, Lahore`,
          city: 'Lahore',
          emergencyContactName: `${pick(firstNames)} ${lastName}`,
          emergencyContactPhone: `+9230${String(randInt(1000000, 9999999))}`,
          emergencyContactRelation: 'Father',
          previousSchool: pick(['City Public School', 'Beaconhouse', 'The Educators', 'Army Public School']),
          admissionDate: daysAgo(randInt(30, 400)),
          status: 'ACTIVE',
          campusId: campus.id,
        },
      });

      await prisma.enrollment.create({
        data: {
          studentId: student.id,
          classSectionId: classSection.id,
          academicSessionId: session.id,
          rollNo: String(i + 1).padStart(2, '0'),
          status: 'ACTIVE',
        },
      });

      await prisma.studentStatusHistory.create({
        data: {
          studentId: student.id,
          toStatus: 'ACTIVE',
          reason: 'Seeded enrolment',
          changedBy: admin.id,
        },
      });

      students.push({
        student: {
          id: student.id,
          firstName,
          lastName,
          admissionNo,
        },
        classSectionId: classSection.id,
        userId: user.id,
      });

      admissionCounter += 1;
    }
  }

  console.log(`  ✓ ${students.length} students enrolled across ${classSections.length} classes`);

  // -------------------------------------------------------------------------
  // Parents
  // -------------------------------------------------------------------------

  const guardianDefs = [
    { name: 'Tariq Mahmood', relation: GuardianRelation.FATHER, occupation: 'Engineer' },
    { name: 'Nadia Mahmood', relation: GuardianRelation.MOTHER, occupation: 'Doctor' },
    { name: 'Asif Iqbal', relation: GuardianRelation.FATHER, occupation: 'Business owner' },
    { name: 'Rukhsana Bibi', relation: GuardianRelation.MOTHER, occupation: 'Teacher' },
    { name: 'Sultan Ahmed', relation: GuardianRelation.GUARDIAN, occupation: 'Civil servant' },
  ];

  // Every student gets at least one parent; some get two, and a few parents
  // have several children to exercise the multi-child dashboard.
  const parentUsers: { id: string; name: string }[] = [];
  let parentCounter = 1;

  for (const studentEntry of students) {
    const def = guardianDefs[(parentCounter - 1) % guardianDefs.length];
    const guardianEmail = `${def.name.split(' ')[0].toLowerCase()}.${def.name.split(' ')[1].toLowerCase()}${parentCounter}@parent.wisdom-academy.example`;

    const guardianUser = await prisma.user.create({
      data: {
        email: guardianEmail,
        passwordHash,
        name: def.name,
        role: Role.PARENT,
        status: UserStatus.ACTIVE,
        phone: `+9231${String(randInt(1000000, 9999999))}`,
        campusId: campus.id,
        emailVerified: new Date(),
      },
    });

    await prisma.guardianLink.create({
      data: {
        guardianUserId: guardianUser.id,
        studentId: studentEntry.student.id,
        relation: def.relation,
        isPrimary: true,
        isAuthorized: true,
        canViewFees: true,
        canViewResults: true,
        receivesNotifications: true,
        contactPhone: guardianUser.phone,
        occupation: def.occupation,
      },
    });

    // A second guardian for every third student.
    if (parentCounter % 3 === 0) {
      const secondDef = guardianDefs[1];
      const secondEmail = `second.guardian${parentCounter}@parent.wisdom-academy.example`;

      const secondGuardian = await prisma.user.create({
        data: {
          email: secondEmail,
          passwordHash,
          name: `${secondDef.name} ${studentEntry.student.lastName}`,
          role: Role.PARENT,
          status: UserStatus.ACTIVE,
          phone: `+9232${String(randInt(1000000, 9999999))}`,
          campusId: campus.id,
        },
      });

      await prisma.guardianLink.create({
        data: {
          guardianUserId: secondGuardian.id,
          studentId: studentEntry.student.id,
          relation: GuardianRelation.MOTHER,
          isPrimary: false,
          isAuthorized: true,
          canViewFees: true,
          canViewResults: true,
          receivesNotifications: true,
        },
      });
    }

    parentUsers.push({ id: guardianUser.id, name: def.name });
    parentCounter += 1;
  }

  // Link one parent to three children so the multi-child view is exercised.
  const multiChildParent = parentUsers[0];
  if (multiChildParent) {
    for (const extra of students.slice(1, 4)) {
      const existing = await prisma.guardianLink.findUnique({
        where: {
          guardianUserId_studentId: {
            guardianUserId: multiChildParent.id,
            studentId: extra.student.id,
          },
        },
      });

      if (!existing) {
        await prisma.guardianLink.create({
          data: {
            guardianUserId: multiChildParent.id,
            studentId: extra.student.id,
            relation: GuardianRelation.GUARDIAN,
            isPrimary: false,
            isAuthorized: true,
            canViewFees: true,
            canViewResults: true,
            receivesNotifications: false,
          },
        });
      }
    }
  }

  console.log(`  ✓ ${parentUsers.length} parent accounts created`);

  // Notification preferences for one parent, opted out of fee reminders.
  await prisma.notificationPreference.createMany({
    data: [
      {
        userId: parentUsers[1]?.id ?? parentUsers[0].id,
        channel: 'WHATSAPP',
        category: 'FEE_REMINDER',
        enabled: false,
        optedOut: true,
        optedOutAt: new Date(),
      },
      {
        userId: parentUsers[0].id,
        channel: 'WHATSAPP',
        category: 'ATTENDANCE_ABSENCE',
        enabled: true,
        consentGivenAt: new Date(),
        consentSource: 'Admission form',
      },
    ],
  });

  // -------------------------------------------------------------------------
  // Timetable
  // -------------------------------------------------------------------------

  const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'] as const;
  const periodStarts = [480, 540, 660, 720, 780, 840]; // 08:00 onwards
  let slotCount = 0;

  for (const classSection of classSections) {
    const classSubjects = await prisma.classSubject.findMany({
      where: { classSectionId: classSection.id },
      include: { subject: true },
    });

    if (classSubjects.length === 0) continue;

    for (const [dayIndex, day] of days.entries()) {
      for (const [periodIndex, start] of periodStarts.entries()) {
        const classSubject = classSubjects[(dayIndex * periodStarts.length + periodIndex) % classSubjects.length];

        // Pick a teacher who teaches this subject.
        const teacher = teachers.find((t) => t.subjects.includes(classSubject.subject.code));
        if (!teacher) continue;

        const room = rooms[(dayIndex + periodIndex + classSections.indexOf(classSection)) % rooms.length];

        // Skip if the teacher is already booked at this time.
        const clash = await prisma.timetableSlot.findFirst({
          where: {
            teacherProfileId: teacher.profile.id,
            dayOfWeek: day,
            startMinute: start,
            status: { not: 'CANCELLED' },
          },
          select: { id: true },
        });

        if (clash) continue;

        await prisma.timetableSlot.create({
          data: {
            classSectionId: classSection.id,
            subjectId: classSubject.subjectId,
            teacherProfileId: teacher.profile.id,
            roomId: room.id,
            dayOfWeek: day,
            startMinute: start,
            endMinute: start + 50,
            effectiveFrom: session.startDate,
            effectiveTo: session.endDate,
            createdBy: admin.id,
          },
        });
        slotCount += 1;
      }
    }
  }

  console.log(`  ✓ ${slotCount} timetable slots scheduled`);

  // -------------------------------------------------------------------------
  // Attendance for the last 20 weekdays
  // -------------------------------------------------------------------------

  const attendanceDates: Date[] = [];
  for (let i = 1; attendanceDates.length < 20 && i < 40; i += 1) {
    const date = daysAgo(i);
    const weekday = date.getUTCDay();
    if (weekday !== 0 && weekday !== 6) attendanceDates.push(date);
  }

  let attendanceCount = 0;
  let absentCount = 0;

  for (const classSection of classSections) {
    const enrolled = students.filter((s) => s.classSectionId === classSection.id);

    for (const date of attendanceDates) {
      const session = await prisma.attendanceSession.create({
        data: {
          classSectionId: classSection.id,
          date,
          period: 'DAY',
          markedByUserId: admin.id,
          markedByProfileId: teachers[0].profile.id,
        },
      });

      for (const entry of enrolled) {
        // ~8% absence rate, with occasional lateness.
        const roll = rand();
        const status = roll < 0.08 ? 'ABSENT' : roll < 0.14 ? 'LATE' : 'PRESENT';

        if (status === 'ABSENT') absentCount += 1;

        await prisma.attendanceRecord.create({
          data: {
            attendanceSessionId: session.id,
            studentId: entry.student.id,
            status,
            lateMinutes: status === 'LATE' ? randInt(5, 25) : null,
            markedByUserId: admin.id,
          },
        });
        attendanceCount += 1;
      }
    }
  }

  console.log(`  ✓ ${attendanceCount} attendance records (${absentCount} absences)`);

  // -------------------------------------------------------------------------
  // Fee structures and invoices
  // -------------------------------------------------------------------------

  const feeStructures = [];
  for (const course of courses) {
    const structure = await prisma.feeStructure.create({
      data: {
        name: `${course.name} — standard plan`,
        courseId: course.id,
        academicSessionId: session.id,
        campusId: campus.id,
        frequency: course.feeFrequency,
        items: {
          create: [
            { head: 'Tuition fee', amount: course.baseFee, frequency: course.feeFrequency },
            { head: 'Examination fee', amount: 1200, frequency: 'TERM' as const },
            { head: 'Library and lab fee', amount: 800, frequency: 'MONTHLY' as const },
          ],
        },
      },
    });
    feeStructures.push(structure);
  }

  // Invoice every student for the current month.
  let invoiceCount = 0;
  let paidCount = 0;

  const { createInvoice, recordPayment } = await import('../src/server/services/fees');

  for (const entry of students) {
    const classSection = classSections.find((c) => c.id === entry.classSectionId);
    if (!classSection) continue;

    const structure = feeStructures.find((f) => f.courseId === classSection.courseId);
    if (!structure) continue;

    const structureItems = await prisma.feeStructureItem.findMany({
      where: { feeStructureId: structure.id },
    });

    const issueDate = daysAgo(20);
    const dueDate = daysAhead(rand() < 0.3 ? -5 : 10); // some overdue

    try {
      const invoice = await createInvoice({
        studentId: entry.student.id,
        academicSessionId: session.id,
        classSectionId: classSection.id,
        issueDate,
        dueDate,
        items: structureItems.map((item) => ({
          head: item.head,
          quantity: 1,
          unitAmount: Number(item.amount.toString()),
        })),
        discount:
          rand() < 0.15
            ? { type: 'SCHOLARSHIP', amount: 1500, reason: 'Merit scholarship — seeded' }
            : null,
        createdByUserId: admin.id,
      });

      invoiceCount += 1;

      // Pay in full, partially, or not at all.
      const roll = rand();
      if (roll < 0.6) {
        await recordPayment({
          invoiceId: invoice.id,
          amount: Number(invoice.balance.toString()),
          method: pick(['CASH', 'BANK_TRANSFER', 'ONLINE_GATEWAY']) as never,
          paidAt: daysAgo(randInt(1, 15)),
          reference: `SEED-${invoiceCount}`,
          recordedByUserId: admin.id,
        });
        paidCount += 1;
      } else if (roll < 0.8) {
        await recordPayment({
          invoiceId: invoice.id,
          amount: Math.round(Number(invoice.balance.toString()) * 0.5 * 100) / 100,
          method: 'CASH' as never,
          paidAt: daysAgo(randInt(1, 10)),
          recordedByUserId: admin.id,
        });
        paidCount += 1;
      }
    } catch (error) {
      console.warn(`  ! invoice failed for ${entry.student.admissionNo}:`, (error as Error).message);
    }
  }

  console.log(`  ✓ ${invoiceCount} invoices created (${paidCount} with payments)`);

  // -------------------------------------------------------------------------
  // Examinations and results
  // -------------------------------------------------------------------------

  const examDefs = [
    { name: 'First Monthly Test', examType: 'MONTHLY_TEST' as const, startOffset: -45, resultStatus: 'PUBLISHED' as const },
    { name: 'Mid-Term Examination', examType: 'MIDTERM' as const, startOffset: -20, resultStatus: 'PUBLISHED' as const },
    { name: 'Second Monthly Test', examType: 'MONTHLY_TEST' as const, startOffset: -8, resultStatus: 'APPROVED' as const },
    { name: 'Final Examination', examType: 'FINAL' as const, startOffset: 25, resultStatus: 'DRAFT' as const },
  ];

  const { computeMarkDerived, loadGradeScale } = await import('../src/server/services/exams');
  const gradeScaleLoaded = await loadGradeScale(gradeScale.id);

  let resultCount = 0;

  for (const examDef of examDefs) {
    const startDate = daysAgo(-examDef.startOffset);
    const isUpcoming = examDef.startOffset > 0;

    const exam = await prisma.exam.create({
      data: {
        name: examDef.name,
        examType: examDef.examType,
        academicSessionId: session.id,
        termId: examDef.startOffset < 0 ? term1.id : term2.id,
        status: isUpcoming ? 'SCHEDULED' : 'COMPLETED',
        startDate,
        endDate: new Date(startDate.getTime() + 5 * DAY_MS),
        classSectionIds: classSections.map((c) => c.id),
        resultStatus: examDef.resultStatus,
        publishedAt: examDef.resultStatus === 'PUBLISHED' ? new Date(startDate.getTime() + 8 * DAY_MS) : null,
        createdBy: admin.id,
        instructions:
          'Bring your own stationery. Mobile phones are not permitted in the examination hall. Arrive 15 minutes before the start time.',
      },
    });

    for (const classSection of classSections.slice(0, 4)) {
      const classSubjects = await prisma.classSubject.findMany({
        where: { classSectionId: classSection.id },
        include: { subject: true },
        take: 5,
      });

      const enrolled = students.filter((s) => s.classSectionId === classSection.id);

      for (const [subjectIndex, classSubject] of classSubjects.entries()) {
        const examSubject = await prisma.examSubject.create({
          data: {
            examId: exam.id,
            subjectId: classSubject.subjectId,
            classSectionId: classSection.id,
            maxMarks: 100,
            passMarks: 40,
            examDate: new Date(startDate.getTime() + subjectIndex * DAY_MS),
            startMinute: 540,
            endMinute: 660,
            gradeScaleId: gradeScale.id,
          },
        });

        // Only enter marks for exams that have happened.
        if (isUpcoming) continue;

        for (const entry of enrolled) {
          // Give each student a consistent ability level so trends are visible.
          const abilitySeed = entry.student.admissionNo.charCodeAt(entry.student.admissionNo.length - 1) % 10;
          const baseAbility = 45 + abilitySeed * 4;
          const noise = randInt(-12, 12);
          const raw = Math.max(12, Math.min(98, baseAbility + noise));

          const marks = Math.round((raw / 100) * 100);
          const derived = computeMarkDerived({
            marksObtained: marks,
            maxMarks: 100,
            status: 'SCORED' as never,
            bands: gradeScaleLoaded?.bands ?? [],
          });

          await prisma.examResult.create({
            data: {
              examSubjectId: examSubject.id,
              studentId: entry.student.id,
              marksObtained: marks,
              status: 'SCORED',
              percentage: derived.percentage,
              grade: derived.grade,
              gpa: derived.gpa,
              enteredBy: teachers[0].user.id,
              approvedBy: examDef.resultStatus !== 'DRAFT' ? admin.id : null,
              approvedAt: examDef.resultStatus !== 'DRAFT' ? new Date() : null,
              gradeScaleId: gradeScale.id,
            },
          });
          resultCount += 1;
        }
      }
    }
  }

  console.log(`  ✓ ${examDefs.length} examinations with ${resultCount} mark entries`);

  // -------------------------------------------------------------------------
  // Assignments
  // -------------------------------------------------------------------------

  const assignmentDefs = [
    { title: 'Quadratic equations worksheet', subjectCode: 'MATH', dueOffset: -3, status: 'PUBLISHED' as const },
    { title: 'Essay: My future career', subjectCode: 'ENG', dueOffset: 2, status: 'PUBLISHED' as const },
    { title: 'Newton\'s laws problem set', subjectCode: 'PHY', dueOffset: 5, status: 'PUBLISHED' as const },
    { title: 'Periodic table exercise', subjectCode: 'CHEM', dueOffset: -8, status: 'PUBLISHED' as const },
    { title: 'Cell structure diagram', subjectCode: 'BIO', dueOffset: 7, status: 'PUBLISHED' as const },
  ];

  let assignmentCount = 0;
  let submissionCount = 0;

  for (const classSection of classSections.slice(0, 4)) {
    const enrolled = students.filter((s) => s.classSectionId === classSection.id);

    for (const def of assignmentDefs) {
      const subject = subjectByCode.get(def.subjectCode);
      if (!subject) continue;

      const classSubject = await prisma.classSubject.findFirst({
        where: { classSectionId: classSection.id, subjectId: subject.id },
      });
      if (!classSubject) continue;

      const teacher = teachers.find((t) => t.subjects.includes(def.subjectCode));
      if (!teacher) continue;

      const assignment = await prisma.assignment.create({
        data: {
          title: def.title,
          description:
            'Complete all questions in the attached worksheet. Show your working clearly and submit before the deadline.',
          classSectionId: classSection.id,
          subjectId: subject.id,
          teacherProfileId: teacher.profile.id,
          status: def.status,
          dueAt: new Date(Date.now() + def.dueOffset * DAY_MS),
          maxMarks: 20,
          publishedAt: new Date(Date.now() - 10 * DAY_MS),
        },
      });
      assignmentCount += 1;

      for (const entry of enrolled) {
        const roll = rand();
        const isPast = def.dueOffset < 0;

        let status: 'NOT_SUBMITTED' | 'SUBMITTED' | 'LATE' | 'GRADED' = 'NOT_SUBMITTED';
        if (roll < 0.7) status = isPast ? 'GRADED' : 'SUBMITTED';
        else if (roll < 0.8 && isPast) status = 'LATE';

        await prisma.assignmentSubmission.create({
          data: {
            assignmentId: assignment.id,
            studentId: entry.student.id,
            status,
            content: status === 'NOT_SUBMITTED' ? null : 'Submitted via the student portal.',
            submittedAt:
              status === 'NOT_SUBMITTED' ? null : new Date(Date.now() - randInt(1, 9) * DAY_MS),
            marksObtained:
              status === 'GRADED' ? Math.round((randInt(60, 98) / 100) * 20 * 10) / 10 : null,
            feedback:
              status === 'GRADED'
                ? pick(['Well presented work.', 'Good effort — review question 4.', 'Excellent reasoning throughout.'])
                : null,
            gradedAt: status === 'GRADED' ? new Date(Date.now() - randInt(1, 3) * DAY_MS) : null,
            gradedBy: status === 'GRADED' ? teacher.user.id : null,
            isLate: status === 'LATE',
          },
        });
        submissionCount += 1;
      }
    }
  }

  console.log(`  ✓ ${assignmentCount} assignments with ${submissionCount} submissions`);

  // -------------------------------------------------------------------------
  // Announcements
  // -------------------------------------------------------------------------

  await prisma.announcement.createMany({
    data: [
      {
        title: 'Parent–teacher meeting — Saturday',
        body:
          'The termly parent–teacher meeting will be held this Saturday from 09:00 to 13:00 in the main hall. ' +
          'Please arrive during your child\'s allocated slot. Attendance cards will be issued at the entrance.',
        audience: 'ALL',
        category: 'EVENT',
        priority: 'HIGH',
        authorId: admin.id,
        campusId: campus.id,
        isPinned: true,
      },
      {
        title: 'Mid-term results published',
        body:
          'Mid-term examination results are now available in the student and parent portals. ' +
          'Please review them with your child and contact the class teacher if you have any questions.',
        audience: 'PARENTS',
        category: 'ACADEMIC',
        priority: 'NORMAL',
        authorId: admin.id,
        campusId: campus.id,
      },
      {
        title: 'Science exhibition registration open',
        body:
          'Registration for the annual science exhibition is now open to all Grade 9 and Grade 10 students. ' +
          'Submit your project proposal to the science department by the end of next week.',
        audience: 'STUDENTS',
        category: 'EVENT',
        priority: 'NORMAL',
        authorId: teachers[2].user.id,
        campusId: campus.id,
      },
      {
        title: 'Fee payment deadline reminder',
        body:
          'This month\'s fee invoices have been issued. Please ensure payment by the due date shown on your invoice ' +
          'to avoid a late fee. Online transfer and counter payment are both accepted.',
        audience: 'PARENTS',
        category: 'FINANCE',
        priority: 'HIGH',
        authorId: admin.id,
        campusId: campus.id,
      },
      {
        title: 'Academy closed — public holiday',
        body:
          'The academy will remain closed for the upcoming public holiday. Classes resume as normal the following day.',
        audience: 'ALL',
        category: 'HOLIDAY',
        priority: 'NORMAL',
        authorId: admin.id,
        campusId: campus.id,
        publishAt: daysAhead(18),
      },
    ],
  });

  // -------------------------------------------------------------------------
  // Learning resources
  // -------------------------------------------------------------------------

  await prisma.learningResource.createMany({
    data: [
      {
        title: 'Algebra formula sheet',
        description: 'One-page summary of the algebraic identities required for Grade 9 and 10.',
        subjectId: subjectByCode.get('MATH')!.id,
        classSectionId: classSections[0].id,
        category: 'NOTE',
        fileUrl: '/resources/algebra-formula-sheet.pdf',
        fileType: 'application/pdf',
        fileSize: 184_320,
        uploadedBy: admin.id,
      },
      {
        title: 'Essay writing guide',
        description: 'Structure, planning and common mistakes for descriptive essays.',
        subjectId: subjectByCode.get('ENG')!.id,
        classSectionId: classSections[0].id,
        category: 'GUIDE',
        fileUrl: '/resources/essay-writing-guide.pdf',
        fileType: 'application/pdf',
        fileSize: 402_112,
        uploadedBy: admin.id,
      },
      {
        title: 'Newton\'s laws — worked examples',
        description: 'Ten worked problems covering all three laws of motion.',
        subjectId: subjectByCode.get('PHY')!.id,
        classSectionId: classSections[2].id,
        category: 'WORKSHEET',
        fileUrl: '/resources/newtons-laws-worked-examples.pdf',
        fileType: 'application/pdf',
        fileSize: 291_840,
        uploadedBy: admin.id,
      },
      {
        title: 'Periodic table reference',
        description: 'Full colour printable periodic table with atomic masses.',
        subjectId: subjectByCode.get('CHEM')!.id,
        category: 'REFERENCE',
        fileUrl: '/resources/periodic-table.pdf',
        fileType: 'application/pdf',
        fileSize: 1_048_576,
        uploadedBy: admin.id,
      },
      {
        title: 'Introduction to Python',
        description: 'Getting started with variables, loops and functions.',
        subjectId: subjectByCode.get('CS')!.id,
        classSectionId: classSections[5].id,
        category: 'NOTE',
        fileUrl: '/resources/intro-to-python.pdf',
        fileType: 'application/pdf',
        fileSize: 512_000,
        uploadedBy: admin.id,
      },
    ],
  });

  // -------------------------------------------------------------------------
  // Leave requests
  // -------------------------------------------------------------------------

  await prisma.leaveRequest.createMany({
    data: [
      {
        teacherProfileId: teachers[1].profile.id,
        leaveType: 'SICK',
        startDate: daysAhead(6),
        endDate: daysAhead(7),
        reason: 'Medical appointment',
        status: 'PENDING',
      },
      {
        teacherProfileId: teachers[3].profile.id,
        leaveType: 'CASUAL',
        startDate: daysAgo(10),
        endDate: daysAgo(10),
        reason: 'Family commitment',
        status: 'APPROVED',
        reviewedBy: admin.id,
        reviewedAt: daysAgo(12),
        reviewNotes: 'Approved. Substitute arranged.',
      },
      {
        teacherProfileId: teachers[4].profile.id,
        leaveType: 'PERSONAL',
        startDate: daysAhead(14),
        endDate: daysAhead(16),
        reason: 'Personal travel',
        status: 'PENDING',
      },
    ],
  });

  // -------------------------------------------------------------------------
  // Admission applications
  // -------------------------------------------------------------------------

  await prisma.admissionApplication.createMany({
    data: [
      {
        applicationNo: 'APP-2026-0001',
        firstName: 'Sana',
        lastName: 'Rafiq',
        gender: 'FEMALE',
        dateOfBirth: daysAgo(5100),
        phone: '+923009988776',
        email: 'sana.rafiq@example.com',
        guardianName: 'Rafiq Ahmed',
        guardianPhone: '+923009988700',
        guardianRelation: 'FATHER',
        previousSchool: 'City Public School',
        previousGrade: 'Grade 8',
        requestedClass: 'Grade 9 — A',
        message: 'We would like to enrol our daughter for the coming term.',
        status: 'APPLICANT',
        source: 'ONLINE',
      },
      {
        applicationNo: 'APP-2026-0002',
        firstName: 'Hasan',
        lastName: 'Ali',
        gender: 'MALE',
        dateOfBirth: daysAgo(5400),
        phone: '+923017766554',
        guardianName: 'Ali Raza',
        guardianPhone: '+923017766500',
        guardianRelation: 'FATHER',
        previousGrade: 'Grade 10',
        requestedClass: 'Grade 11 — Pre-Engineering',
        status: 'APPLICANT',
        source: 'ONLINE',
      },
      {
        applicationNo: 'APP-2026-0003',
        firstName: 'Mehak',
        lastName: 'Zahid',
        gender: 'FEMALE',
        dateOfBirth: daysAgo(4600),
        guardianName: 'Zahid Hussain',
        guardianPhone: '+923025544332',
        guardianRelation: 'FATHER',
        requestedClass: 'Entry Test — Evening',
        status: 'APPLICANT',
        reviewNotes: 'Documents complete. Invited for assessment.',
        reviewedBy: admin.id,
        reviewedAt: daysAgo(4),
        source: 'WALK_IN',
      },
    ],
  });

  // -------------------------------------------------------------------------
  // Progress notes
  // -------------------------------------------------------------------------

  await prisma.progressNote.createMany({
    data: [
      {
        studentId: students[0].student.id,
        authorId: teachers[0].user.id,
        category: 'ACADEMIC',
        visibility: 'STAFF_PARENT',
        body: 'Ahmed has shown strong improvement in algebra this term. Encouraging him to attempt the extension problems.',
      },
      {
        studentId: students[1].student.id,
        authorId: teachers[1].user.id,
        category: 'BEHAVIOURAL',
        visibility: 'STAFF_PARENT',
        body: 'Consistently participates in class discussions. Needs to focus on submitting homework on time.',
      },
      {
        studentId: students[2].student.id,
        authorId: teachers[2].user.id,
        category: 'ACADEMIC',
        visibility: 'STAFF_ONLY',
        body: 'Internal note: attendance has dipped this month. Discuss with the family before the term report is issued.',
      },
    ],
  });

  // -------------------------------------------------------------------------
  // Audit trail
  // -------------------------------------------------------------------------

  await prisma.auditLog.createMany({
    data: [
      {
        actorId: admin.id,
        actorEmail: admin.email,
        actorRole: 'ADMIN',
        action: 'seed.database',
        entity: 'System',
        after: { note: 'Development seed completed', students: students.length },
      },
      {
        actorId: admin.id,
        actorEmail: admin.email,
        actorRole: 'ADMIN',
        action: 'exam.publish',
        entity: 'Exam',
        after: { examName: 'Mid-Term Examination' },
      },
    ],
  });

  console.log('\n✅ Seed complete\n');
  console.log('   Demo accounts (all use the same password):');
  console.log(`   password: ${SEED_PASSWORD}\n`);
  console.log('   Administrator  owner@wisdom-academy.example');
  console.log('   Administrator  registrar@wisdom-academy.example');
  console.log('   Teacher        ayesha.siddiqui@wisdom-academy.example');
  console.log('   Teacher        fatima.noor@wisdom-academy.example');
  console.log('   Student        ' + students[0].student.admissionNo + ' → check the seeded student email pattern');
  console.log('   Parent         check the seeded parent email pattern\n');
}

main()
  .catch((error) => {
    console.error('\n❌ Seed failed:\n', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

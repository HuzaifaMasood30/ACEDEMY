import { prisma } from '@/lib/prisma';

/**
 * Read-only queries used by the public website.
 *
 * Only deliberately public information is returned: no student records, no fee
 * data, no staff contact details beyond name, designation and department.
 */

export async function getPublicCourses() {
  return prisma.course.findMany({
    where: { isActive: true },
    orderBy: [{ name: 'asc' }],
    include: {
      courseSubjects: {
        include: { subject: { select: { name: true, code: true } } },
        orderBy: { sequence: 'asc' },
      },
      classSections: {
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          capacity: true,
          _count: { select: { enrollments: { where: { status: 'ACTIVE' } } } },
        },
      },
      _count: { select: { classSections: true } },
    },
  });
}

export async function getPublicCourseByCode(code: string) {
  return prisma.course.findFirst({
    where: { code, isActive: true },
    include: {
      courseSubjects: {
        include: { subject: { select: { name: true, code: true, credits: true } } },
        orderBy: { sequence: 'asc' },
      },
      classSections: {
        where: { isActive: true },
        select: { id: true, name: true, capacity: true, _count: { select: { enrollments: true } } },
      },
    },
  });
}

export async function getPublicFaculty() {
  return prisma.teacherProfile.findMany({
    where: { isActive: true },
    orderBy: [{ department: 'asc' }, { user: { name: 'asc' } }],
    select: {
      id: true,
      designation: true,
      department: true,
      qualification: true,
      specialization: true,
      user: { select: { name: true, avatarUrl: true } },
      teacherSubjects: {
        select: { subject: { select: { name: true, code: true } } },
      },
    },
  });
}

/**
 * Notices shown on the public site.
 *
 * Only published, non-expired notices addressed to everyone or to prospective
 * applicants are visible here.
 */
export async function getPublicNotices(limit = 20) {
  const now = new Date();

  return prisma.announcement.findMany({
    where: {
      status: 'PUBLISHED',
      audience: { in: ['ALL', 'APPLICANTS'] },
      publishAt: { lte: now },
      OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
    },
    orderBy: [{ isPinned: 'desc' }, { publishAt: 'desc' }, { createdAt: 'desc' }],
    take: limit,
    select: {
      id: true,
      title: true,
      body: true,
      category: true,
      priority: true,
      publishAt: true,
      createdAt: true,
      isPinned: true,
    },
  });
}

/** Aggregate figures safe to show publicly. */
export async function getPublicStats() {
  const [students, teachers, courses, classes] = await Promise.all([
    prisma.student.count({ where: { status: 'ACTIVE' } }),
    prisma.teacherProfile.count({ where: { isActive: true } }),
    prisma.course.count({ where: { isActive: true } }),
    prisma.classSection.count({ where: { isActive: true } }),
  ]);

  return { students, teachers, courses, classes };
}

export async function getPublicFaqs() {
  return [
    {
      question: 'How do I apply for admission?',
      answer:
        'Complete the online admission form on the Admissions page. You will receive an application reference number immediately and the academy office will contact you within two working days to arrange an assessment and interview.',
    },
    {
      question: 'What documents are required?',
      answer:
        'A birth certificate or form of identification, the most recent school report or result card, and two passport-sized photographs. Documents can be uploaded with the online application or submitted at the office.',
    },
    {
      question: 'How are fees calculated and paid?',
      answer:
        'Each course has a published fee plan, either monthly, per term, quarterly or one-off for short courses. Invoices are issued to the parent portal, and payment can be made by cash at the office, bank transfer, or through the online payment option where available.',
    },
    {
      question: 'Is there a scholarship or concession available?',
      answer:
        'Yes. Merit scholarships and need-based concessions are available and are applied as an authorised discount against the fee invoice. Please speak to the academy office with supporting evidence.',
    },
    {
      question: 'How will I be kept informed about my child?',
      answer:
        'The parent portal shows attendance, results, assignments and fee statements. Where a guardian has consented, absence alerts and fee reminders are also sent by WhatsApp to the verified contact number on the admission record.',
    },
    {
      question: 'Can I book a trial class?',
      answer:
        'Yes. Mention your interest in a trial class on the admissions form and the office will arrange a visit to a suitable session for your child.',
    },
  ];
}

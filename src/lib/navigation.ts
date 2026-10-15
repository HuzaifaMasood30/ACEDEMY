import type { Role } from '@prisma/client';
import { PERMISSIONS as P, type Permission } from './rbac';

export interface NavItem {
  label: string;
  href: string;
  icon: string;
  /** Any one of these permissions reveals the item. */
  permissions?: Permission[];
  exact?: boolean;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

/**
 * Navigation is declared per role and filtered again by permission at render
 * time. Hiding a link is presentation only — the page itself re-checks.
 */
export const NAVIGATION: Record<Role, NavSection[]> = {
  ADMIN: [
    {
      title: 'Overview',
      items: [
        { label: 'Dashboard', href: '/admin', icon: 'LayoutDashboard', exact: true },
        { label: 'Analytics', href: '/admin/analytics', icon: 'TrendingUp', permissions: [P.REPORT_VIEW] },
        { label: 'Alerts', href: '/admin/alerts', icon: 'BellRing', permissions: [P.PROGRESS_VIEW] },
      ],
    },
    {
      title: 'People',
      items: [
        { label: 'Students', href: '/admin/students', icon: 'GraduationCap', permissions: [P.STUDENT_VIEW] },
        { label: 'Admissions', href: '/admin/admissions', icon: 'FileInput', permissions: [P.APPLICATION_VIEW] },
        { label: 'Teachers', href: '/admin/teachers', icon: 'Users', permissions: [P.TEACHER_VIEW] },
        { label: 'Parents', href: '/admin/parents', icon: 'HeartHandshake', permissions: [P.GUARDIAN_VIEW] },
        { label: 'User accounts', href: '/admin/users', icon: 'KeyRound', permissions: [P.USER_VIEW] },
      ],
    },
    {
      title: 'Academics',
      items: [
        { label: 'Courses', href: '/admin/courses', icon: 'BookOpen', permissions: [P.COURSE_VIEW] },
        { label: 'Subjects', href: '/admin/subjects', icon: 'Library', permissions: [P.SUBJECT_VIEW] },
        { label: 'Classes', href: '/admin/classes', icon: 'School', permissions: [P.CLASS_VIEW] },
        { label: 'Sessions', href: '/admin/sessions', icon: 'CalendarRange', permissions: [P.SESSION_VIEW] },
        { label: 'Timetable', href: '/admin/timetable', icon: 'CalendarClock', permissions: [P.TIMETABLE_VIEW] },
        { label: 'Attendance', href: '/admin/attendance', icon: 'ClipboardCheck', permissions: [P.ATTENDANCE_VIEW] },
        { label: 'Examinations', href: '/admin/exams', icon: 'FileSpreadsheet', permissions: [P.EXAM_VIEW] },
        { label: 'Results', href: '/admin/results', icon: 'Award', permissions: [P.MARKS_VIEW] },
        { label: 'Grading scales', href: '/admin/grading', icon: 'SlidersHorizontal', permissions: [P.GRADING_MANAGE] },
      ],
    },
    {
      title: 'Finance',
      items: [
        { label: 'Fee structures', href: '/admin/fees/structures', icon: 'Receipt', permissions: [P.FEE_STRUCTURE_VIEW] },
        { label: 'Invoices', href: '/admin/fees/invoices', icon: 'FileText', permissions: [P.INVOICE_VIEW] },
        { label: 'Payments', href: '/admin/fees/payments', icon: 'Wallet', permissions: [P.PAYMENT_VIEW] },
        { label: 'Dues & aging', href: '/admin/fees/dues', icon: 'AlarmClock', permissions: [P.FINANCE_REPORTS] },
      ],
    },
    {
      title: 'Communication',
      items: [
        { label: 'Announcements', href: '/admin/announcements', icon: 'Megaphone', permissions: [P.ANNOUNCEMENT_VIEW] },
        { label: 'Notifications', href: '/admin/notifications', icon: 'Send', permissions: [P.NOTIFICATION_VIEW_LOGS] },
        { label: 'WhatsApp', href: '/admin/whatsapp', icon: 'MessageCircle', permissions: [P.NOTIFICATION_MANAGE] },
        { label: 'Templates', href: '/admin/templates', icon: 'FileCode2', permissions: [P.TEMPLATE_MANAGE] },
      ],
    },
    {
      title: 'System',
      items: [
        { label: 'Reports', href: '/admin/reports', icon: 'BarChart3', permissions: [P.REPORT_VIEW] },
        { label: 'Settings', href: '/admin/settings', icon: 'Settings', permissions: [P.SETTINGS_VIEW] },
        { label: 'Audit log', href: '/admin/audit', icon: 'ScrollText', permissions: [P.AUDIT_VIEW] },
        { label: 'System health', href: '/admin/system', icon: 'Activity', permissions: [P.SYSTEM_BACKUP] },
      ],
    },
  ],

  TEACHER: [
    {
      title: 'Overview',
      items: [
        { label: 'Dashboard', href: '/teacher', icon: 'LayoutDashboard', exact: true },
        { label: 'My timetable', href: '/teacher/timetable', icon: 'CalendarClock' },
      ],
    },
    {
      title: 'Teaching',
      items: [
        { label: 'My classes', href: '/teacher/classes', icon: 'School' },
        { label: 'Attendance', href: '/teacher/attendance', icon: 'ClipboardCheck', permissions: [P.ATTENDANCE_MARK] },
        { label: 'Assignments', href: '/teacher/assignments', icon: 'ClipboardList', permissions: [P.ASSIGNMENT_VIEW] },
        { label: 'Resources', href: '/teacher/resources', icon: 'FolderOpen', permissions: [P.RESOURCE_VIEW] },
      ],
    },
    {
      title: 'Assessment',
      items: [
        { label: 'Marks entry', href: '/teacher/marks', icon: 'FileSpreadsheet', permissions: [P.MARKS_ENTER] },
        { label: 'Results', href: '/teacher/results', icon: 'Award', permissions: [P.MARKS_VIEW] },
      ],
    },
    {
      title: 'Students & parents',
      items: [
        { label: 'My students', href: '/teacher/students', icon: 'GraduationCap', permissions: [P.STUDENT_VIEW] },
        { label: 'Progress notes', href: '/teacher/progress', icon: 'NotebookPen', permissions: [P.PROGRESS_NOTE_CREATE] },
        { label: 'Announcements', href: '/teacher/announcements', icon: 'Megaphone', permissions: [P.ANNOUNCEMENT_CREATE] },
      ],
    },
    {
      title: 'Personal',
      items: [
        { label: 'Leave requests', href: '/teacher/leave', icon: 'CalendarX' },
        { label: 'Notifications', href: '/teacher/notifications', icon: 'Bell' },
      ],
    },
  ],

  STUDENT: [
    {
      title: 'Overview',
      items: [
        { label: 'Dashboard', href: '/student', icon: 'LayoutDashboard', exact: true },
        { label: 'My progress', href: '/student/progress', icon: 'TrendingUp' },
      ],
    },
    {
      title: 'Academics',
      items: [
        { label: 'Timetable', href: '/student/timetable', icon: 'CalendarClock' },
        { label: 'Attendance', href: '/student/attendance', icon: 'ClipboardCheck' },
        { label: 'Assignments', href: '/student/assignments', icon: 'ClipboardList' },
        { label: 'Results', href: '/student/results', icon: 'Award' },
        { label: 'Exams', href: '/student/exams', icon: 'FileSpreadsheet' },
      ],
    },
    {
      title: 'Learning',
      items: [
        { label: 'Learning resources', href: '/student/resources', icon: 'FolderOpen' },
      ],
    },
    {
      title: 'Account',
      items: [
        { label: 'Fees', href: '/student/fees', icon: 'Wallet' },
        { label: 'Announcements', href: '/student/announcements', icon: 'Megaphone' },
        { label: 'Notifications', href: '/student/notifications', icon: 'Bell' },
        { label: 'Profile', href: '/student/profile', icon: 'UserCog' },
      ],
    },
  ],

  PARENT: [
    {
      title: 'Overview',
      items: [
        { label: 'Dashboard', href: '/parent', icon: 'LayoutDashboard', exact: true },
        { label: 'My children', href: '/parent/children', icon: 'Users' },
      ],
    },
    {
      title: 'Academics',
      items: [
        { label: 'Attendance', href: '/parent/attendance', icon: 'ClipboardCheck' },
        { label: 'Results', href: '/parent/results', icon: 'Award' },
        { label: 'Timetable', href: '/parent/timetable', icon: 'CalendarClock' },
        { label: 'Assignments', href: '/parent/assignments', icon: 'ClipboardList' },
        { label: 'Progress reports', href: '/parent/progress', icon: 'TrendingUp' },
      ],
    },
    {
      title: 'Finance',
      items: [
        { label: 'Fees & invoices', href: '/parent/fees', icon: 'Wallet' },
      ],
    },
    {
      title: 'Communication',
      items: [
        { label: 'Announcements', href: '/parent/announcements', icon: 'Megaphone' },
        { label: 'Notifications', href: '/parent/notifications', icon: 'Bell' },
        { label: 'Preferences', href: '/parent/preferences', icon: 'Settings2' },
      ],
    },
  ],
};

export const PUBLIC_NAV = [
  { label: 'Home', href: '/' },
  { label: 'About', href: '/about' },
  { label: 'Courses', href: '/courses' },
  { label: 'Faculty', href: '/faculty' },
  { label: 'Admissions', href: '/admissions' },
  { label: 'Notices', href: '/notices' },
  { label: 'Contact', href: '/contact' },
];

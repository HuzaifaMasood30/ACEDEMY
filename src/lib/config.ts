import { env } from './env';

/** Academy-wide defaults that are not security-sensitive. */
export const academyConfig = {
  name: env.ACADEMY_NAME,
  timezone: env.ACADEMY_TIMEZONE,
  currency: env.ACADEMY_CURRENCY,
  locale: env.ACADEMY_LOCALE,
  quietHours: {
    start: env.WHATSAPP_QUIET_HOURS_START,
    end: env.WHATSAPP_QUIET_HOURS_END,
  },
  storage: {
    driver: env.STORAGE_DRIVER,
    maxFileMb: env.STORAGE_MAX_FILE_MB,
  },
} as const;

/** Keys stored in the `Setting` table. Changing a key here is a data migration. */
export const SETTING_KEYS = {
  academyProfile: 'academy.profile',
  attendanceRules: 'academy.attendance_rules',
  gradingDefaults: 'academy.grading_defaults',
  feeRules: 'academy.fee_rules',
  notificationRules: 'academy.notification_rules',
  academicRules: 'academy.academic_rules',
} as const;

export interface AttendanceRules {
  /** Minimum attendance percentage before an alert is raised. */
  minimumPercentage: number;
  /** Consecutive absences that trigger a repeated-absence alert. */
  consecutiveAbsenceThreshold: number;
  /** Marking a record older than this many days requires ATTENDANCE_APPROVE. */
  editWindowDays: number;
  /** Whether a teacher's edit needs approval from an administrator. */
  requireApprovalForEdits: boolean;
  notifyGuardiansOnAbsence: boolean;
  notifyOnLateArrival: boolean;
}

export const DEFAULT_ATTENDANCE_RULES: AttendanceRules = {
  minimumPercentage: 75,
  consecutiveAbsenceThreshold: 3,
  editWindowDays: 3,
  requireApprovalForEdits: true,
  notifyGuardiansOnAbsence: true,
  notifyOnLateArrival: false,
};

export interface FeeRules {
  invoicePrefix: string;
  receiptPrefix: string;
  /** Days after the due date before a late fee applies. */
  lateFeeGraceDays: number;
  lateFeeAmount: number;
  lateFeeIsPercentage: boolean;
  /** Reminder offsets in days relative to the due date (negative = before). */
  reminderOffsetsDays: number[];
}

export const DEFAULT_FEE_RULES: FeeRules = {
  invoicePrefix: 'INV',
  receiptPrefix: 'RCP',
  lateFeeGraceDays: 7,
  lateFeeAmount: 0,
  lateFeeIsPercentage: false,
  reminderOffsetsDays: [-7, -3, 0, 3, 7],
};

export interface NotificationRules {
  absenceNotificationsEnabled: boolean;
  resultNotificationsEnabled: boolean;
  feeReminderEnabled: boolean;
  examReminderEnabled: boolean;
  /** Exam reminder lead time in days. */
  examReminderLeadDays: number;
  /** Maximum bulk messages per hour. */
  bulkRateLimitPerHour: number;
  respectQuietHours: boolean;
}

export const DEFAULT_NOTIFICATION_RULES: NotificationRules = {
  absenceNotificationsEnabled: true,
  resultNotificationsEnabled: true,
  feeReminderEnabled: true,
  examReminderEnabled: true,
  examReminderLeadDays: 2,
  bulkRateLimitPerHour: 300,
  respectQuietHours: true,
};

export interface AcademicRules {
  passingPercentage: number;
  promotionMinimumAttendance: number;
  promotionMinimumPercentage: number;
  studentIdPrefix: string;
  duplicateDetectionFields: string[];
}

export const DEFAULT_ACADEMIC_RULES: AcademicRules = {
  passingPercentage: 40,
  promotionMinimumAttendance: 75,
  promotionMinimumPercentage: 40,
  studentIdPrefix: 'STD',
  duplicateDetectionFields: ['firstName', 'lastName', 'dateOfBirth'],
};

export interface GradingDefaults {
  defaultScaleName: string;
  showRankInResults: boolean;
  roundToDecimals: number;
}

export const DEFAULT_GRADING_DEFAULTS: GradingDefaults = {
  defaultScaleName: 'Standard Percentage',
  showRankInResults: true,
  roundToDecimals: 2,
};

export type SettingValueMap = {
  'academy.attendance_rules': AttendanceRules;
  'academy.fee_rules': FeeRules;
  'academy.notification_rules': NotificationRules;
  'academy.academic_rules': AcademicRules;
  'academy.grading_defaults': GradingDefaults;
  'academy.profile': Record<string, unknown>;
};

export const SETTING_DEFAULTS: Partial<Record<string, unknown>> = {
  [SETTING_KEYS.attendanceRules]: DEFAULT_ATTENDANCE_RULES,
  [SETTING_KEYS.feeRules]: DEFAULT_FEE_RULES,
  [SETTING_KEYS.notificationRules]: DEFAULT_NOTIFICATION_RULES,
  [SETTING_KEYS.academicRules]: DEFAULT_ACADEMIC_RULES,
  [SETTING_KEYS.gradingDefaults]: DEFAULT_GRADING_DEFAULTS,
};

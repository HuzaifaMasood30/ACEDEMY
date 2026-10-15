/**
 * Message templates.
 *
 * Templates are resolved from the database when a row exists for the key, so
 * the academy can reword a message without a deploy. The constants below are
 * the shipped defaults and the source of truth for variable names.
 */

export interface TemplateContext {
  studentName?: string;
  guardianName?: string;
  className?: string;
  batchName?: string;
  date?: string;
  academyName?: string;
  subjectName?: string;
  amount?: string;
  dueDate?: string;
  invoiceNo?: string;
  examName?: string;
  receiptNo?: string;
  balance?: string;
  period?: string;
  reason?: string;
  status?: string;
  assignmentTitle?: string;
  deadline?: string;
  title?: string;
  body?: string;
  [key: string]: string | undefined;
}

export interface TemplateDefinition {
  key: string;
  name: string;
  category: string;
  body: string;
  /** Provider template name for the Cloud API, when one has been approved. */
  providerTemplateName?: string;
  variables: string[];
}

export const DEFAULT_TEMPLATES: Record<string, TemplateDefinition> = {
  absence_alert: {
    key: 'absence_alert',
    name: 'Student absence alert',
    category: 'ATTENDANCE_ABSENCE',
    body:
      'Dear {{guardianName}}, your child {{studentName}} was marked absent from ' +
      '{{className}} on {{date}}. Please contact the academy if you need assistance. — {{academyName}}',
    variables: ['guardianName', 'studentName', 'className', 'date', 'academyName'],
  },
  late_alert: {
    key: 'late_alert',
    name: 'Late arrival alert',
    category: 'ATTENDANCE_ABSENCE',
    body:
      'Dear {{guardianName}}, {{studentName}} arrived late to {{className}} on {{date}}. ' +
      'Please contact the academy if you need assistance. — {{academyName}}',
    variables: ['guardianName', 'studentName', 'className', 'date', 'academyName'],
  },
  fee_reminder: {
    key: 'fee_reminder',
    name: 'Fee payment reminder',
    category: 'FEE_REMINDER',
    body:
      'Dear {{guardianName}}, invoice {{invoiceNo}} for {{studentName}} of {{amount}} is due on ' +
      '{{dueDate}}. Please contact the academy office for assistance. — {{academyName}}',
    variables: ['guardianName', 'studentName', 'invoiceNo', 'amount', 'dueDate', 'academyName'],
  },
  fee_overdue: {
    key: 'fee_overdue',
    name: 'Overdue fee notice',
    category: 'FEE_OVERDUE',
    body:
      'Dear {{guardianName}}, invoice {{invoiceNo}} for {{studentName}} is overdue. ' +
      'Outstanding balance: {{balance}} (due {{dueDate}}). Please contact the academy office. — {{academyName}}',
    variables: ['guardianName', 'studentName', 'invoiceNo', 'balance', 'dueDate', 'academyName'],
  },
  exam_reminder: {
    key: 'exam_reminder',
    name: 'Examination reminder',
    category: 'EXAM_REMINDER',
    body:
      'Dear {{guardianName}}, {{examName}} for {{studentName}} begins on {{date}}. ' +
      'Please ensure your child is prepared. — {{academyName}}',
    variables: ['guardianName', 'studentName', 'examName', 'date', 'academyName'],
  },
  result_published: {
    key: 'result_published',
    name: 'Result published',
    category: 'RESULT_PUBLISHED',
    body:
      'Dear {{guardianName}}, results for {{examName}} have been published for {{studentName}}. ' +
      'Sign in to the parent portal to view them. — {{academyName}}',
    variables: ['guardianName', 'studentName', 'examName', 'academyName'],
  },
  timetable_change: {
    key: 'timetable_change',
    name: 'Timetable change',
    category: 'TIMETABLE_CHANGE',
    body:
      'Dear {{guardianName}}, the schedule for {{studentName}} in {{className}} has changed on ' +
      '{{date}}. {{body}} — {{academyName}}',
    variables: ['guardianName', 'studentName', 'className', 'date', 'body', 'academyName'],
  },
  assignment_new: {
    key: 'assignment_new',
    name: 'New assignment',
    category: 'ASSIGNMENT_NEW',
    body:
      'Dear {{guardianName}}, a new assignment "{{assignmentTitle}}" was set for {{studentName}} in ' +
      '{{subjectName}}. Deadline: {{deadline}}. — {{academyName}}',
    variables: ['guardianName', 'studentName', 'assignmentTitle', 'subjectName', 'deadline', 'academyName'],
  },
  assignment_due: {
    key: 'assignment_due',
    name: 'Assignment due soon',
    category: 'ASSIGNMENT_DUE',
    body:
      'Dear {{guardianName}}, the assignment "{{assignmentTitle}}" for {{studentName}} is due on ' +
      '{{deadline}}. — {{academyName}}',
    variables: ['guardianName', 'studentName', 'assignmentTitle', 'deadline', 'academyName'],
  },
  announcement: {
    key: 'announcement',
    name: 'General announcement',
    category: 'ANNOUNCEMENT',
    body: '{{title}}\n\n{{body}}\n\n— {{academyName}}',
    variables: ['title', 'body', 'academyName'],
  },
  admission_received: {
    key: 'admission_received',
    name: 'Admission application received',
    category: 'ADMISSION_UPDATE',
    body:
      'Dear {{guardianName}}, we have received the admission application for {{studentName}} ' +
      '(reference {{invoiceNo}}). We will contact you shortly. — {{academyName}}',
    variables: ['guardianName', 'studentName', 'invoiceNo', 'academyName'],
  },
  admission_decision: {
    key: 'admission_decision',
    name: 'Admission decision',
    category: 'ADMISSION_UPDATE',
    body:
      'Dear {{guardianName}}, the admission application for {{studentName}} is now {{status}}. ' +
      'Please contact the academy office for details. — {{academyName}}',
    variables: ['guardianName', 'studentName', 'status', 'academyName'],
  },
  account_created: {
    key: 'account_created',
    name: 'Account created',
    category: 'ACCOUNT',
    body:
      'Welcome to {{academyName}}. An account has been created for {{studentName}}. ' +
      'Please contact the academy office if you did not expect this message.',
    variables: ['academyName', 'studentName'],
  },
};

/** Replace `{{variable}}` placeholders, leaving unknown ones visibly intact. */
export function applyVariables(body: string, context: TemplateContext): string {
  return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key: string) => {
    const value = context[key];
    return value === undefined || value === null || value === '' ? match : String(value);
  });
}

/**
 * Render a template body.
 *
 * Falls back to the compiled default when the key is unknown so a missing
 * template row degrades to a readable message rather than an empty one.
 */
export function renderTemplate(
  key: string | null | undefined,
  context: TemplateContext,
  _locale = 'en',
): string {
  if (!key) {
    return applyVariables(context.body ?? '', context);
  }

  const definition = DEFAULT_TEMPLATES[key];
  if (!definition) {
    return applyVariables(context.body ?? '', context);
  }

  return applyVariables(definition.body, context);
}

/** Async variant that prefers a database row over the compiled default. */
export async function renderTemplateFromDb(
  key: string,
  context: TemplateContext,
  locale = 'en',
): Promise<{ body: string; providerTemplateName?: string }> {
  const { prisma } = await import('@/lib/prisma');

  const row = await prisma.messageTemplate.findFirst({
    where: { key, locale, isActive: true },
  });

  if (row) {
    return {
      body: applyVariables(row.body, context),
      providerTemplateName: row.providerTemplateName ?? undefined,
    };
  }

  const definition = DEFAULT_TEMPLATES[key];
  return {
    body: definition ? applyVariables(definition.body, context) : (context.body ?? ''),
    providerTemplateName: definition?.providerTemplateName,
  };
}

/** Variables a template expects that the caller did not supply. */
export function missingVariables(key: string, context: TemplateContext): string[] {
  const definition = DEFAULT_TEMPLATES[key];
  if (!definition) return [];
  return definition.variables.filter(
    (variable) => !context[variable] || String(context[variable]).trim() === '',
  );
}

/** Placeholders still present after rendering — a sign of missing context. */
export function unreplacedPlaceholders(rendered: string): string[] {
  const matches = rendered.match(/\{\{\s*[\w.]+\s*\}\}/g) ?? [];
  return Array.from(new Set(matches));
}

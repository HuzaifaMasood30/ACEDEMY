/**
 * Single source of truth for the product identity.
 *
 * The academy's own name, contact details and branding are editable at runtime
 * through the `academy.profile` setting; this file holds the product-level
 * identity that ships with the code (page titles, marketing copy, the mark).
 */
export const brand = {
  /** Academy name shown throughout the product and public site. */
  name: 'Wisdom Academy',
  /** Compact form for tight spaces (sidebar, badges). */
  shortName: 'Wisdom',
  /** Used in page titles and Open Graph tags. */
  tagline: 'Academy Management & Smart Learning',
  /** One-line description for metadata and the footer. */
  description:
    'A complete academy management platform: admissions, timetables, attendance, fees, examinations, and online learning for administrators, teachers, students and parents.',
  /** Domain used for seed/demo email addresses. Not a live mailbox. */
  emailDomain: 'wisdom-academy.example',
  /** Shown on the public site; override per-deployment if needed. */
  website: 'https://wisdom-academy.example',
  /** Monogram rendered when no logo image is configured. */
  monogram: 'WA',
  /** Primary brand colour, mirrored by --brand in globals.css. */
  color: '#4f46e5',
} as const;

/** `Wisdom Academy — Academy Management & Smart Learning` */
export const brandTitle = `${brand.name} — ${brand.tagline}`;

/** `%s · Wisdom Academy` */
export const brandTitleTemplate = `%s · ${brand.name}`;

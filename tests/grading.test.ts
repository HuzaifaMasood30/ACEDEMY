import { describe, expect, it } from 'vitest';
import { resolveGrade, computeMarkDerived } from '@/server/services/exams';
import { MarksEntryStatus } from '@prisma/client';

/**
 * Grading rules are configurable per course, so the resolver must handle any
 * band set. These bands mirror the seeded default scale.
 */
const BANDS = [
  { grade: 'A+', minPercent: 90, maxPercent: 100, gpa: 4, remark: 'Outstanding' },
  { grade: 'A', minPercent: 80, maxPercent: 90, gpa: 3.7, remark: 'Excellent' },
  { grade: 'B', minPercent: 70, maxPercent: 80, gpa: 3.3, remark: 'Good' },
  { grade: 'C', minPercent: 60, maxPercent: 70, gpa: 3, remark: 'Satisfactory' },
  { grade: 'D', minPercent: 50, maxPercent: 60, gpa: 2, remark: 'Pass' },
  { grade: 'F', minPercent: 0, maxPercent: 50, gpa: 0, remark: 'Fail' },
];

describe('resolveGrade', () => {
  it('matches a band inclusively on its lower bound', () => {
    expect(resolveGrade(90, BANDS)?.grade).toBe('A+');
    expect(resolveGrade(80, BANDS)?.grade).toBe('A');
    expect(resolveGrade(70, BANDS)?.grade).toBe('B');
    expect(resolveGrade(60, BANDS)?.grade).toBe('C');
    expect(resolveGrade(50, BANDS)?.grade).toBe('D');
    expect(resolveGrade(0, BANDS)?.grade).toBe('F');
  });

  it('does not let a lower band capture a boundary value', () => {
    // 90 belongs to A+, never to A (whose range is 80-90).
    expect(resolveGrade(90, BANDS)?.gpa).toBe(4);
    expect(resolveGrade(89.99, BANDS)?.grade).toBe('A');
  });

  it('places a perfect score in the top band despite the exclusive upper bound', () => {
    expect(resolveGrade(100, BANDS)?.grade).toBe('A+');
  });

  it('falls back to the lowest band below the configured range', () => {
    // A scale that starts at 40 must still grade a mark of 10.
    const partial = [{ grade: 'P', minPercent: 40, maxPercent: 100, gpa: 2, remark: null }];
    expect(resolveGrade(10, partial)?.grade).toBe('P');
  });

  it('returns null when no bands are configured', () => {
    expect(resolveGrade(75, [])).toBeNull();
  });

  it('is insensitive to band ordering', () => {
    const shuffled = [BANDS[5], BANDS[1], BANDS[3], BANDS[0], BANDS[4], BANDS[2]];
    expect(resolveGrade(85, shuffled)?.grade).toBe('A');
    expect(resolveGrade(95, shuffled)?.grade).toBe('A+');
  });
});

describe('computeMarkDerived', () => {
  it('computes percentage, grade and GPA for a scored mark', () => {
    const derived = computeMarkDerived({
      marksObtained: 45,
      maxMarks: 50,
      status: MarksEntryStatus.SCORED,
      bands: BANDS,
    });
    expect(derived.percentage).toBe(90);
    expect(derived.grade).toBe('A+');
    expect(derived.gpa).toBe(4);
  });

  it('rounds the percentage to two decimals', () => {
    const derived = computeMarkDerived({
      marksObtained: 1,
      maxMarks: 3,
      status: MarksEntryStatus.SCORED,
      bands: BANDS,
    });
    expect(derived.percentage).toBe(33.33);
    expect(derived.grade).toBe('F');
  });

  it('produces no grade for a non-scored status', () => {
    for (const status of [
      MarksEntryStatus.ABSENT,
      MarksEntryStatus.EXEMPT,
      MarksEntryStatus.WITHHELD,
    ]) {
      const derived = computeMarkDerived({
        marksObtained: null,
        maxMarks: 100,
        status,
        bands: BANDS,
      });
      expect(derived).toEqual({ percentage: null, grade: null, gpa: null });
    }
  });

  it('produces no grade when a scored mark is missing', () => {
    const derived = computeMarkDerived({
      marksObtained: null,
      maxMarks: 100,
      status: MarksEntryStatus.SCORED,
      bands: BANDS,
    });
    expect(derived.grade).toBeNull();
  });

  it('refuses to divide by a non-positive maximum', () => {
    const derived = computeMarkDerived({
      marksObtained: 10,
      maxMarks: 0,
      status: MarksEntryStatus.SCORED,
      bands: BANDS,
    });
    expect(derived).toEqual({ percentage: null, grade: null, gpa: null });
  });
});

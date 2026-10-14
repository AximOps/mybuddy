export interface Mark { score: number; maxScore: number }

/** Average percentage across a subject's marks (equal weight), or null when there are none. */
export function averagePercent(marks: Mark[]): number | null {
  if (!marks.length) return null;
  return marks.reduce((s, m) => s + (m.score / m.maxScore) * 100, 0) / marks.length;
}

/** Grade point on a 10-point scale: the one entered, or the average percentage divided by 10. */
export function gradePointOf(entered: number | null, avg: number | null): number | null {
  if (entered !== null) return entered;
  return avg === null ? null : avg / 10;
}

/** Cumulative GPA on a 10-point scale, weighted by credits. Null until a subject has a grade point and credits. */
export function cumulativeGpa(subjects: { credits: number; gp: number | null }[]): number | null {
  const rated = subjects.filter((s): s is { credits: number; gp: number } => s.gp !== null && s.credits > 0);
  const credits = rated.reduce((s, r) => s + r.credits, 0);
  if (!credits) return null;
  return rated.reduce((s, r) => s + r.gp * r.credits, 0) / credits;
}

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

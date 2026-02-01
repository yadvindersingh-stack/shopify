export function parseAnyDate(input?: string | null): Date | null {
  if (!input) return null;
  const d = new Date(input);
  if (!Number.isFinite(d.getTime())) return null;
  return d;
}

// "30 Jan 2026"
export function formatHumanDate(d: Date, locale = "en-CA") {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

// "30 Jan 2026, 3:15 PM"
export function formatHumanDateTime(d: Date, locale = "en-CA") {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

// "Updated today" / "Detected 3 days ago"
export function relativeDayLabel(args: {
  createdAt?: Date | null;
  evaluatedAt?: Date | null;
  now?: Date;
}) {
  const now = args.now ?? new Date();

  // Prefer evaluatedAt if present (many of your snapshots have evaluated_at)
  const effective = args.evaluatedAt ?? args.createdAt;
  if (!effective) return "—";

  const ms = now.getTime() - effective.getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));

  if (days <= 0) return "Updated today";
  if (days === 1) return "Updated 1 day ago";
  return `Updated ${days} days ago`;
}

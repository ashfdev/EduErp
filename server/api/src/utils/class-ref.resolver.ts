// Forgiving name matching ("Class 8", "class-8", "8", "ক্লাস ৮"), but an ambiguous value is an error, never a guess.

export interface SectionRef {
  id: string;
  name: string;
}

export interface ClassRef {
  id: string;
  name_en: string;
  name_bn: string | null;
  numeric_level: number;
  sections: SectionRef[];
}

export type Resolved<T> = { match: T; error?: undefined } | { match?: undefined; error: string };

// Combining marks are kept, or distinct Bangla names would collapse into each other.
function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6))
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]/gu, "");
}

const CLASS_PREFIXES = ["class", "ক্লাস", "শ্রেণি", "শ্রেণী"].map(normalize);
const SECTION_PREFIXES = ["section", "শাখা"].map(normalize);

function withoutPrefix(normalized: string, prefixes: string[]): string {
  for (const prefix of prefixes) {
    if (normalized.startsWith(prefix) && normalized.length > prefix.length) return normalized.slice(prefix.length);
  }
  return normalized;
}

function pickUnique<T>(candidates: T[], label: (item: T) => string, raw: string, kind: string): Resolved<T> | null {
  const [first, ...rest] = candidates;
  if (first !== undefined && !rest.length) return { match: first };
  if (candidates.length > 1) {
    return { error: `${kind} "${raw}" matches more than one ${kind.toLowerCase()} (${candidates.map(label).join(", ")}) — use the exact name` };
  }
  return null;
}

export function resolveClassRef(classes: ClassRef[], raw: string | undefined): Resolved<ClassRef> {
  const value = (raw ?? "").trim();
  if (!value) return { error: "class is required" };
  if (!classes.length) return { error: "No classes are set up for the selected academic year — check that the right year is selected" };

  const byId = classes.find((c) => c.id === value);
  if (byId) return { match: byId };

  const names = (c: ClassRef) => [c.name_en, c.name_bn].filter((n): n is string => !!n).map(normalize);
  const key = normalize(value);
  const exact = pickUnique(classes.filter((c) => names(c).includes(key)), (c) => c.name_en, value, "Class");
  if (exact) return exact;

  const bare = withoutPrefix(key, CLASS_PREFIXES);
  const level = /^\d+$/.test(bare) ? Number(bare) : null;
  const loose = pickUnique(
    classes.filter((c) => names(c).some((n) => withoutPrefix(n, CLASS_PREFIXES) === bare) || c.numeric_level === level),
    (c) => c.name_en,
    value,
    "Class",
  );
  if (loose) return loose;

  return { error: `Class "${value}" not found in the selected academic year — available: ${classes.map((c) => c.name_en).join(", ")}` };
}

// Blank resolves to null: section is optional, as on the single Add Student form.
export function resolveSectionRef(cls: ClassRef, raw: string | undefined): Resolved<SectionRef | null> {
  const value = (raw ?? "").trim();
  if (!value) return { match: null };

  const byId = cls.sections.find((s) => s.id === value);
  if (byId) return { match: byId };

  const key = normalize(value);
  const exact = pickUnique(cls.sections.filter((s) => normalize(s.name) === key), (s) => s.name, value, "Section");
  if (exact) return exact;

  const bare = withoutPrefix(key, SECTION_PREFIXES);
  const loose = pickUnique(
    cls.sections.filter((s) => withoutPrefix(normalize(s.name), SECTION_PREFIXES) === bare),
    (s) => s.name,
    value,
    "Section",
  );
  if (loose) return loose;

  const available = cls.sections.map((s) => s.name).join(", ");
  return { error: `Section "${value}" not found in ${cls.name_en} — ${available ? `available: ${available}` : "this class has no sections, leave it blank"}` };
}

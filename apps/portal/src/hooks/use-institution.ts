import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface InstitutionProfile {
  type: "SCHOOL" | "COLLEGE" | "UNIVERSITY" | "MADRASAH";
  name_en: string;
}

interface InstitutionConfig {
  has_departments: boolean;
  has_semesters: boolean;
  show_hijri_calendar: boolean;
  term_class: string;
  term_section: string;
  term_teacher: string;
  term_roll: string;
  term_registration: string;
}

const DEFAULT_TERMS: InstitutionConfig = {
  has_departments: false,
  has_semesters: false,
  show_hijri_calendar: false,
  term_class: "Class",
  term_section: "Section",
  term_teacher: "Teacher",
  term_roll: "Roll No",
  term_registration: "Registration No",
};

// First real consumer of the institution-type terminology cascade
// (InstitutionConfig) that's been sitting unwired since Settings→Institution
// was built — every portal page should pull labels from here instead of
// hardcoding "Class"/"Section"/etc.
export function useInstitution() {
  const { data: profile } = useQuery<InstitutionProfile>({
    queryKey: ["institution", "profile"],
    queryFn: async () => (await api.get("/api/settings/institution")).data.data,
    staleTime: 10 * 60 * 1000,
  });
  const { data: config } = useQuery<InstitutionConfig>({
    queryKey: ["institution", "config"],
    queryFn: async () => (await api.get("/api/settings/config")).data.data,
    staleTime: 10 * 60 * 1000,
  });

  return {
    type: profile?.type ?? "SCHOOL",
    institutionName: profile?.name_en,
    terms: config ?? DEFAULT_TERMS,
  };
}

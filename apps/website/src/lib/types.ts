export interface Institution {
  type: "SCHOOL" | "COLLEGE" | "UNIVERSITY" | "MADRASAH";
  has_semesters: boolean;
  name_en: string;
  name_bn: string | null;
  tagline_en: string | null;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  address: string | null;
  phone_primary: string | null;
  email_primary: string | null;
  facebook_url: string | null;
  youtube_url: string | null;
  map_embed_code: string | null;
  eiin: string | null;
  founded_year: number | null;
  established_text: string | null;
  mission_text: string | null;
  vision_text: string | null;
  principal_name: string | null;
  principal_designation: string | null;
  working_days: number[];
}

export interface Slider {
  id: string;
  image_url: string;
  title: string | null;
  subtitle: string | null;
  btn_text: string | null;
  btn_link: string | null;
}

export interface Notice {
  id: string;
  title: string;
  body: string;
  attachment_url: string | null;
  audience: string;
  is_pinned: boolean;
  publish_at: string | null;
  created_at: string;
}

export interface GalleryAlbum {
  id: string;
  name: string;
  description: string | null;
  cover_url: string | null;
  date: string | null;
  _count?: { images: number };
}

export interface GalleryImage {
  id: string;
  image_url: string;
  caption: string | null;
}

export interface DownloadItem {
  id: string;
  title: string;
  file_url: string;
  file_name: string;
  category: string;
  download_count: number;
  created_at: string;
}

export interface StaticPageContent {
  page_key: string;
  title_en: string | null;
  title_bn: string | null;
  content_en: string | null;
  content_bn: string | null;
  meta_title: string | null;
  meta_desc: string | null;
}

export interface FacultyMember {
  id: string;
  name_en: string;
  designation: string;
  photo_url: string | null;
}

export interface Publication {
  title: string;
  url: string;
}

export interface FacultyDetail {
  id: string;
  name_en: string;
  name_bn: string | null;
  designation: string;
  photo_url: string | null;
  qualifications: string | null;
  achievements: string | null;
  publications: Publication[] | null;
  department: { name_en: string } | null;
  program: { name_en: string } | null;
  subjects_taught: string[];
}

export interface GoverningBodyMember {
  id: string;
  name: string;
  designation: string;
  group: string;
  photo_url: string | null;
  bio: string | null;
}

export interface EventItem {
  id: string;
  name: string;
  date_from: string;
  date_to: string | null;
  type: string;
  description: string | null;
}

export interface JobPosting {
  id: string;
  title: string;
  department: string | null;
  description: string;
  requirements: string | null;
  deadline: string | null;
}

export interface ProgramCourse {
  id: string;
  semester_number: number;
  code: string;
  name_en: string;
  credit_hours: number;
  course_type: string;
}

export interface ProgramSummary {
  id: string;
  name_en: string;
  name_bn: string | null;
  code: string;
  duration_semesters: number;
  total_credit_hours: number;
  degree_level: "UNDERGRADUATE" | "GRADUATE" | "PHD";
  courses: ProgramCourse[];
}

export interface DepartmentSummary {
  id: string;
  name_en: string;
  name_bn: string | null;
  code: string;
  programs: ProgramSummary[];
}

export interface DepartmentsResponse {
  departments: DepartmentSummary[];
  unassigned_programs: ProgramSummary[];
}

export interface ImportantLink {
  id: string;
  title: string;
  url: string;
}

export interface ClassPickerSection {
  id: string;
  name: string;
}

export interface ClassPickerGroup {
  id: string;
  name_en: string;
}

export interface ClassPicker {
  id: string;
  name_en: string;
  sections: ClassPickerSection[];
  groups: ClassPickerGroup[];
}

export interface RoutineSlotItem {
  id: string;
  day_of_week: number;
  period_no: number;
  start_time: string;
  end_time: string;
  subject: { name_en: string } | null;
  teacher: { name_en: string } | null;
}

export interface AdmissionCycleSummary {
  id: string;
  name: string;
  class: { name_en: string };
  seat_count: number;
  close_date: string;
}

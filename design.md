# EduErp - Ultimate System Design, Structure & AI Prompts

This document contains the **in-depth, line-by-line breakdown** of every module, folder, sub-route, and the exact UI components that will go into them across the entire EduErp system.

---

## 🏢 1. Admin Panel (`apps/admin/src/app/(dashboard)`)

The Admin Panel is the core of the ERP. Here is the exact breakdown of every section and what the UI will contain.

### 1.1 Dashboard (`/dashboard`)
*   **Routes:** `/` (Main Dashboard)
*   **UI Components:**
    *   **Metric Cards:** Total Students, Active Staff, Today's Revenue, Pending Leaves.
    *   **Charts:** Monthly Revenue (Bar Chart), Attendance Overview (Line Chart).
    *   **Tables:** 'Recent Activities' and 'Pending Approvals' widget.

### 1.2 Students (`/students`)
*   **Routes:**
    *   `/` - Student Directory (Data Table with search, filter by Class/Section).
    *   `/new` - Add Student (Multi-step form: Personal, Guardian, Academic, Documents).
    *   `/[id]` - Student Profile (Tabs: Overview, Fees, Results, Attendance, Disciplinary).
    *   `/bulk-import` - CSV/Excel upload zone with data mapping UI.
    *   `/promote` - UI to select a class and promote them to the next academic session.
    *   `/at-risk` - List of students with < 70% attendance or failing grades.

### 1.3 Fees (`/fees`)
*   **Routes:**
    *   `/` - Overview of fee collections.
    *   `/collect` - Search student and collect fees (POS style UI with print receipt button).
    *   `/invoices` - Generate and view invoices.
    *   `/structures` - Define fee types (Tuition, Transport) and assign amounts to classes.
    *   `/bank-transfers` - Reconcile online/bank payments.
    *   `/reports` - Date-wise collection and due reports.

### 1.4 HR (Human Resources) (`/hr`)
*   **Routes:**
    *   `/` - HR Dashboard.
    *   `/staff` - Staff directory (Teachers, Admins, Drivers, etc.).
    *   `/leave` - Leave approval interface (Approve/Reject buttons).
    *   `/payroll` - Generate monthly salary slips.
    *   `/salary-structures` - Define Basic, HRA, Allowances, Deductions.
    *   `/faculty` - Specific list and performance of teaching staff.
    *   `/jobs` - Open vacancies and candidate tracking.
    *   `/appraisals` - Staff performance reviews.

### 1.5 Academics & Classes (`/course-enrollment`, `/subjects`)
*   **UI Components:**
    *   **Class & Section Setup:** UI to create Class 1 to 10, sections A/B/C.
    *   **Subject Assign:** Matrix table mapping Subjects -> Classes -> Teachers.
    *   **Syllabus/Lesson Plan:** Upload UI for academic plans.

### 1.6 Attendance (`/attendance`)
*   **Routes & UI:**
    *   `/` - Daily attendance overview.
    *   `/mark` - Select Class -> Section -> Date. Displays grid of students with Present/Absent/Late toggles.
    *   `/reports` - Generate monthly attendance sheets (Export to Excel/PDF).

### 1.7 Examination & Marks (`/examination`, `/marks`, `/results`)
*   **Routes & UI:**
    *   `/examination/new` - Create exam (Half-Yearly, Final), set dates.
    *   `/marks` - Grid UI for teachers/admins to input marks subject-wise. (Spreadsheet-like UI).
    *   `/results` - Auto-generate report cards. Button: "Publish Results".

### 1.8 Inventory & Assets (`/inventory`)
*   **UI Components:**
    *   Categories (Stationery, Electronics, Furniture).
    *   Item Master (Add new items).
    *   Issue/Return UI (Assign laptop to Teacher X).
    *   Low Stock Alerts.

### 1.9 Library (`/library`)
*   **UI Components:**
    *   Book Catalog (Add book by ISBN/Title).
    *   Member List (Students/Teachers).
    *   Issue & Return interface (Input Book ID, Input Student ID -> Issue).
    *   Fine/Overdue List.

### 1.10 Transport & Hostel (`/transport`, `/hostel`)
*   **Transport UI:** Add Vehicles, Add Routes/Stops, Assign Students to Routes, Track Driver info.
*   **Hostel UI:** Add Blocks/Rooms, Manage bed capacity, Assign Student to Bed, Hostel Fee allocation.

### 1.11 Operations & Comms (`/complaints`, `/document-requests`, `/notifications`, `/documents`)
*   **UI Components:**
    *   Ticketing system for Complaints (Open, In Progress, Resolved).
    *   Document Requests (Student requested Transfer Certificate -> Admin Approves -> Generates PDF).
    *   Notifications (Rich text editor to send SMS, Email, or App Push to specific classes).

---

## 👨‍🎓 2. Student & Parent Portal (`apps/portal/src/app`)

This portal is mobile-first. Here is the exact routing and UI structure.

### 2.1 Main Screens
*   `/dashboard` - Welcome message. Widgets: Next Exam Date, Total Unpaid Fees, Today's Classes, Attendance % Circle.
*   `/profile` - Read-only view of student's personal info, parents' info, and medical records.
*   `/routine` - Weekly timetable. UI: Tabs for Mon-Sun. Shows Subject, Time, Teacher Name, Room No.

### 2.2 Academic Features
*   `/attendance` - Calendar view. Green dots (Present), Red dots (Absent).
*   `/homework` - List of daily assignments. UI: Card with Subject, Title, Due Date. Click to view details/attachments.
*   `/resources` - Downloadable study materials (PDFs, PPTs) uploaded by teachers.
*   `/subjects` - List of enrolled subjects and respective syllabus.
*   `/quizzes` - Online MCQ tests. UI: Timer, Question, 4 Options, Submit button.

### 2.3 Exams & Results
*   `/admit-card` - "Download Admit Card" button (Generates PDF if fees are clear).
*   `/results` - View past exam term results. UI: Beautiful grade table and radar chart for performance.

### 2.4 Admin & Operations
*   `/fees` - List of invoices. Status badges (Paid, Unpaid, Overdue). "Pay Now" button integrating payment gateway.
*   `/complaints` - Simple form: Subject, Description -> Submit to Admin.
*   `/document-requests` - Request form (e.g., "Need Bonafide Certificate").
*   `/notices` - Infinite scroll list of school announcements.
*   `/bus-tracker` - Map View (Leaflet.js) showing live bus location.
*   `/transport-hostel` - Info about assigned bus driver's number or hostel warden's number.
*   `/ptm` - Parent-Teacher Meeting slots. UI: Calendar to select an available slot and book.

---

## 👨‍🏫 3. Teacher Portal (`apps/teacher/src/app`)

Focused on speed and minimal clicks.

### 3.1 Dashboard & Profile
*   `/dashboard` - Today's Schedule timeline. "Pending Tasks" list.
*   `/profile` - Teacher's personal details and uploaded documents.
*   `/routine` - Full weekly schedule for the teacher.

### 3.2 Core Academic Tasks
*   `/attendance` - Extremely fast UI. Select class from today's schedule -> Grid of students -> "Mark All Present" button -> toggle individuals to Absent -> Save.
*   `/marks` - Spreadsheet-like grid. Select Exam -> Select Subject -> Input marks directly into rows. Auto-calculates totals.
*   `/resources` - File upload zone to share notes with specific classes.
*   `/quizzes` - Quiz builder (Add question, add 4 options, mark correct answer).

### 3.3 Teacher's HR Features
*   `/leave` - Form to apply for Casual/Sick leave. List of past leaves with Status (Pending, Approved, Rejected).
*   `/complaints` - Submit internal issues to HR/Admin.
*   `/ptm` - View booked slots by parents. Option to block out specific times.

---

## 🤖 4. Super Detailed AI Prompts (For v0, IDX, Bolt)

To get exactly what is described above, use these mega-prompts. **Do not use basic prompts.** Use these exact words.

### 🟣 Mega-Prompt for Admin Dashboard & Layout
> "I am building the Admin Panel for an Education ERP using Next.js 14 App Router, Tailwind CSS, and shadcn/ui. 
> 
> Create the main layout and dashboard.
> **Sidebar Navigation:** Must be collapsible. Group them as follows:
> - **Dashboard** (Home)
> - **Academics:** Students, Course Enrollment, Attendance, Examination, Marks, Results
> - **Finance:** Fees Collection, Accounts, Payroll
> - **HR:** Staff, Leave, Appraisals, Jobs
> - **Operations:** Inventory, Library, Transport, Hostel
> - **Communication:** Notifications, Complaints, Document Requests
> - **Settings**
>
> **Topbar:** Global Search Input, Notification Bell (with unread badge), User Avatar Dropdown.
>
> **Main Content (Dashboard):**
> 1. Top row: 4 Metric cards (Total Students, Total Teachers, Today's Collection, Pending Leaves) utilizing Lucide icons.
> 2. Middle row: A 2/3 width Bar Chart (Monthly Revenue) and a 1/3 width Donut Chart (Attendance Overview).
> 3. Bottom row: A 'Recent Admissions' data table with columns: ID, Name, Class, Date, Status (Badge).
> 
> **Design Rules:** Monochromatic Slate/Zinc theme. Primary color is deep indigo. Use heavy whitespace, rounded-xl borders, very soft shadows, and clean modern typography. Make it look like a highly expensive SaaS product."

### 🟢 Mega-Prompt for Student Portal Dashboard
> "Design the main Dashboard for a Student/Parent Portal in an Education ERP using Next.js and Tailwind. This MUST be a mobile-first design.
> 
> **Navigation:** Desktop gets a sleek left sidebar, Mobile gets a sticky Bottom Navigation Bar with icons (Home, Routine, Fees, Profile).
> 
> **Header:** Display 'Hello, {Student Name}' with the School Logo and a notification bell.
> 
> **Main View Layout:**
> 1. **Alerts Banner:** A full-width styled banner saying 'Reminder: Math Exam Tomorrow at 10 AM' (Yellow/Orange tint).
> 2. **Attendance Ring:** A large, beautiful circular progress bar displaying '85% Attendance this month'.
> 3. **Quick Links Grid:** 4x2 grid of small cards with icons for: Admit Card, Results, Homework, Resources, Quizzes, PTM, Bus Tracker.
> 4. **Today's Classes:** A vertical timeline or card list showing the subjects, time, and teacher for today.
> 
> **Design Rules:** Friendly, approachable, highly visual. Use pastel background colors for cards (light blue, light green), large readable typography, and soft UI components without harsh borders."

### 🔵 Mega-Prompt for Teacher's Attendance Page
> "Design an 'Attendance Entry' page for a Teacher Portal using Next.js, Tailwind, and shadcn/ui.
> 
> **Context:** A teacher needs to take attendance extremely fast on a tablet or laptop.
> 
> **Layout:**
> 1. **Header:** 'Mark Attendance' title. Below it, selection dropdowns for: Class, Section, and a Date Picker (defaulting to today).
> 2. **Action Bar:** A button saying 'Mark All Present' (Green).
> 3. **Main Grid:** A responsive grid/list of students. Each student card/row shows: Roll Number, Avatar, Name. Next to the name is a segmented control or toggle buttons: [ Present ] [ Absent ] [ Late ]. 
> 4. **Footer:** A sticky bottom bar with a primary 'Save Attendance' button.
> 
> **Design Rules:** High contrast. Present is green, Absent is red, Late is yellow. The UI should feel like a specialized, native productivity app. Clean, borders, and no unnecessary graphics."

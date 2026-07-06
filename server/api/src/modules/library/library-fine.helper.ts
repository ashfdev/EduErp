import { prisma } from "../../lib/prisma";

function daysLate(dueDate: Date, asOf: Date): number {
  const diff = Math.floor((asOf.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

// Shared by the student-360 profile (students.routes.ts, previously a
// hardcoded { issued_books: [], total_fines: 0 } stub) and the admit-card
// clearance gate. The daysLate()*fine_per_day arithmetic itself already
// existed and is proven in library.routes.ts's return-processing and
// overdue report — this just aggregates it per student, for both already
// RETURNED-but-unpaid fines and still-ISSUED (still accruing) ones.
export async function computeStudentLibraryFines(studentId: string) {
  const issues = await prisma.bookIssue.findMany({
    where: { person_id: studentId, person_type: "STUDENT" },
    include: { book: { select: { title: true } } },
    orderBy: { issued_at: "desc" },
  });

  const now = new Date();
  let totalFines = 0;
  const issuedBooks = issues.map((issue) => {
    const currentFine = issue.status === "RETURNED" ? issue.fine_amount : daysLate(issue.due_date, now) * issue.fine_per_day;
    const unpaid = issue.status === "RETURNED" ? (issue.fine_paid ? 0 : issue.fine_amount) : currentFine;
    totalFines += unpaid;
    return {
      id: issue.id,
      book_title: issue.book.title,
      due_date: issue.due_date,
      status: issue.status,
      current_fine: currentFine,
      unpaid,
    };
  });

  return { issued_books: issuedBooks, total_fines: totalFines };
}

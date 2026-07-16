-- StudentAcademicHistory.class_id/section_id were plain scalar columns with
-- no FK relation, so Academic History entries could never be joined back to
-- a class/section name for display (Phase 76). Add the missing relations —
-- verified no orphaned rows exist first.
ALTER TABLE "StudentAcademicHistory" ADD CONSTRAINT "StudentAcademicHistory_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "Class"("id") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "StudentAcademicHistory" ADD CONSTRAINT "StudentAcademicHistory_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "Section"("id") ON UPDATE CASCADE ON DELETE SET NULL;

CREATE TABLE "student_subject_results" (
	"id" serial PRIMARY KEY,
	"student_id" integer NOT NULL,
	"subject_id" integer NOT NULL,
	"result" text NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "student_subject_results_student_id_subject_id_unique" UNIQUE("student_id","subject_id")
);
--> statement-breakpoint
ALTER TABLE "assessment_items" ADD COLUMN "weight" numeric(5,4) DEFAULT '1' NOT NULL;--> statement-breakpoint
ALTER TABLE "assessment_items" ALTER COLUMN "points" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "assessment_items" ALTER COLUMN "points" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "student_subject_results" ADD CONSTRAINT "student_subject_results_student_id_students_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "student_subject_results" ADD CONSTRAINT "student_subject_results_subject_id_subjects_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE;
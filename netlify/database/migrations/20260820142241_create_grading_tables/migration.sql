CREATE TABLE "assessment_items" (
	"id" serial PRIMARY KEY,
	"subject_id" integer NOT NULL,
	"name" text NOT NULL,
	"points" numeric(6,2) DEFAULT '0' NOT NULL,
	"repeat_count" integer DEFAULT 1 NOT NULL,
	"kind" text DEFAULT 'written' NOT NULL,
	"exam_slot" text,
	"needs_confirmation" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "student_scores" (
	"id" serial PRIMARY KEY,
	"student_id" integer NOT NULL,
	"assessment_item_id" integer NOT NULL,
	"score" numeric(6,2),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "student_scores_student_id_assessment_item_id_unique" UNIQUE("student_id","assessment_item_id")
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" serial PRIMARY KEY,
	"identity_user_id" text UNIQUE,
	"email" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	"student_number" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"credits" integer NOT NULL,
	"grading_type" text DEFAULT 'letter' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "assessment_items" ADD CONSTRAINT "assessment_items_subject_id_subjects_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "student_scores" ADD CONSTRAINT "student_scores_student_id_students_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "student_scores" ADD CONSTRAINT "student_scores_assessment_item_id_assessment_items_id_fkey" FOREIGN KEY ("assessment_item_id") REFERENCES "assessment_items"("id") ON DELETE CASCADE;
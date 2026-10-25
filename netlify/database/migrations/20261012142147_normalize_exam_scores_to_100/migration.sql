-- Custom SQL migration file, put your code below! --
UPDATE "student_scores" AS scores
SET "score" = scores."score" * 100 / (items."points" * items."repeat_count")
FROM "assessment_items" AS items
WHERE scores."assessment_item_id" = items."id"
  AND items."exam_slot" IN ('midterm', 'final')
  AND items."points" > 0
  AND items."repeat_count" > 0
  AND (items."points" <> 100 OR items."repeat_count" <> 1);
--> statement-breakpoint
UPDATE "assessment_items"
SET "weight" = "points" * "repeat_count" * "weight" / 100,
    "points" = 100,
    "repeat_count" = 1
WHERE "exam_slot" IN ('midterm', 'final')
  AND "points" > 0
  AND "repeat_count" > 0
  AND ("points" <> 100 OR "repeat_count" <> 1);

#!/usr/bin/env bash
# Netlify 시절 CSV 5개를 지금 DB에 "합친다" (지우지 않음).
#  - 과목은 이름, 평가 항목은 (과목, 항목 이름), 학생은 이메일(소문자)로 짝을 지음
#  - 양쪽에 모두 입력된 점수/결과는 CSV 값으로 덮어씀. CSV에 비어 있는 값은 기존 값을 지우지 않음
#  - 끝에 배점표(update-schedule.sql)와 지필 보정(fix-data.sql)을 적용
# 사용: DATABASE_URL=postgres://... ./scripts/import-merge.sh <CSV 폴더>
# 폴더에는 subjects.csv, assessment_items.csv, students.csv, student_scores.csv, student_subject_results.csv
set -euo pipefail
DIR="${1:?CSV 폴더 경로를 넣어줘}"
: "${DATABASE_URL:?DATABASE_URL이 필요해}"
HERE="$(cd "$(dirname "$0")" && pwd)"
for t in subjects assessment_items students student_scores student_subject_results; do
  [ -f "$DIR/$t.csv" ] || { echo "없는 파일: $DIR/$t.csv" >&2; exit 1; }
done

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<SQL
BEGIN;
CREATE TEMP TABLE c_subjects (id int, name text, category text, credits int, grading_type text, sort_order int, created_at text) ON COMMIT DROP;
CREATE TEMP TABLE c_items (id int, subject_id int, name text, points numeric, repeat_count int, kind text, exam_slot text, needs_confirmation boolean, sort_order int, created_at text, weight numeric) ON COMMIT DROP;
CREATE TEMP TABLE c_students (id int, identity_user_id text, email text, name text, student_number text, created_at text) ON COMMIT DROP;
CREATE TEMP TABLE c_scores (id int, student_id int, assessment_item_id int, score numeric, updated_at text) ON COMMIT DROP;
CREATE TEMP TABLE c_results (id int, student_id int, subject_id int, result text, updated_at text) ON COMMIT DROP;
\copy c_subjects FROM '$DIR/subjects.csv' WITH (FORMAT csv, HEADER true)
\copy c_items FROM '$DIR/assessment_items.csv' WITH (FORMAT csv, HEADER true)
\copy c_students FROM '$DIR/students.csv' WITH (FORMAT csv, HEADER true)
\copy c_scores FROM '$DIR/student_scores.csv' WITH (FORMAT csv, HEADER true)
\copy c_results FROM '$DIR/student_subject_results.csv' WITH (FORMAT csv, HEADER true)

-- 과목: 이름이 같으면 갱신, 없으면 추가
UPDATE subjects s SET category = c.category, credits = c.credits, grading_type = c.grading_type, sort_order = c.sort_order
FROM c_subjects c WHERE s.name = c.name;
INSERT INTO subjects (name, category, credits, grading_type, sort_order)
SELECT c.name, c.category, c.credits, c.grading_type, c.sort_order FROM c_subjects c
WHERE NOT EXISTS (SELECT 1 FROM subjects s WHERE s.name = c.name);
CREATE TEMP TABLE m_subject ON COMMIT DROP AS
  SELECT c.id AS old_id, s.id AS new_id FROM c_subjects c JOIN subjects s ON s.name = c.name;

-- 평가 항목: (과목, 이름)이 같으면 갱신, 없으면 추가
UPDATE assessment_items a SET points = c.points, repeat_count = c.repeat_count, kind = c.kind, exam_slot = c.exam_slot,
  needs_confirmation = c.needs_confirmation, sort_order = c.sort_order, weight = c.weight
FROM c_items c JOIN m_subject m ON m.old_id = c.subject_id
WHERE a.subject_id = m.new_id AND a.name = c.name;
INSERT INTO assessment_items (subject_id, name, points, repeat_count, kind, exam_slot, needs_confirmation, sort_order, weight)
SELECT m.new_id, c.name, c.points, c.repeat_count, c.kind, c.exam_slot, c.needs_confirmation, c.sort_order, c.weight
FROM c_items c JOIN m_subject m ON m.old_id = c.subject_id
WHERE NOT EXISTS (SELECT 1 FROM assessment_items a WHERE a.subject_id = m.new_id AND a.name = c.name);
CREATE TEMP TABLE m_item ON COMMIT DROP AS
  SELECT c.id AS old_id, a.id AS new_id FROM c_items c JOIN m_subject m ON m.old_id = c.subject_id
  JOIN assessment_items a ON a.subject_id = m.new_id AND a.name = c.name;

-- 학생: 이메일이 같으면 이름/학번만 채움(구글 로그인 연결은 그대로 둠), 없으면 추가(로그인 시 이메일로 연결됨)
UPDATE students s SET name = c.name, student_number = COALESCE(c.student_number, s.student_number)
FROM c_students c WHERE lower(s.email) = lower(c.email);
INSERT INTO students (identity_user_id, email, name, student_number)
SELECT NULL, lower(c.email), c.name, c.student_number FROM c_students c
WHERE NOT EXISTS (SELECT 1 FROM students s WHERE lower(s.email) = lower(c.email));
CREATE TEMP TABLE m_student ON COMMIT DROP AS
  SELECT c.id AS old_id, s.id AS new_id FROM c_students c JOIN students s ON lower(s.email) = lower(c.email);

-- 점수/결과: CSV 값이 있으면 덮어쓰기
INSERT INTO student_scores (student_id, assessment_item_id, score)
SELECT ms.new_id, mi.new_id, c.score FROM c_scores c
JOIN m_student ms ON ms.old_id = c.student_id JOIN m_item mi ON mi.old_id = c.assessment_item_id
WHERE c.score IS NOT NULL
ON CONFLICT (student_id, assessment_item_id) DO UPDATE SET score = EXCLUDED.score, updated_at = now();

INSERT INTO student_subject_results (student_id, subject_id, result)
SELECT ms.new_id, msub.new_id, c.result FROM c_results c
JOIN m_student ms ON ms.old_id = c.student_id JOIN m_subject msub ON msub.old_id = c.subject_id
WHERE c.result IS NOT NULL AND c.result <> ''
ON CONFLICT (student_id, subject_id) DO UPDATE SET result = EXCLUDED.result, updated_at = now();
COMMIT;
SQL

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$HERE/fix-data.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$HERE/update-schedule.sql"

for t in subjects assessment_items students student_scores student_subject_results; do
  printf '%-26s %s행\n' "$t" "$(psql "$DATABASE_URL" -tAc "SELECT COUNT(*) FROM $t")"
done
echo "--- CSV에 없는데 DB에 있는 평가 항목 (기본 시드 잔여물일 수 있음, 점수 없는 것만) ---"
psql "$DATABASE_URL" -tAc "SELECT s.name || ' / ' || a.name FROM assessment_items a JOIN subjects s ON s.id=a.subject_id WHERE NOT EXISTS (SELECT 1 FROM student_scores x WHERE x.assessment_item_id=a.id AND x.score IS NOT NULL) ORDER BY s.sort_order, a.sort_order"

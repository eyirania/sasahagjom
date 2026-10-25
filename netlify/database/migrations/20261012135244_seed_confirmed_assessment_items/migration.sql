-- Custom SQL migration file, put your code below! --
DELETE FROM assessment_items AS item
USING subjects AS subject
WHERE item.subject_id = subject.id
  AND subject.name <> '미술'
  AND item.name = '확인 필요'
  AND item.points = 0
  AND item.needs_confirmation = true
  AND NOT EXISTS (SELECT 1 FROM student_scores WHERE assessment_item_id = item.id);

UPDATE assessment_items
SET name = '', points = NULL, weight = 1, kind = 'performance', exam_slot = NULL
WHERE name = '확인 필요' AND points = 0 AND needs_confirmation = true;

WITH confirmed(subject_name, name, points, weight, kind, exam_slot, sort_order) AS (
  VALUES
    ('프로그래밍I', '1회고사', 100, 0.3, 'written', 'midterm'::text, 1),
    ('프로그래밍I', '탐색기반 연습문제', 15, 1, 'performance', NULL, 2),
    ('프로그래밍I', '관계기반 연습문제', 15, 1, 'performance', NULL, 3),
    ('프로그래밍I', '탐색기반 문제해결 1', 10, 1, 'performance', NULL, 4),
    ('프로그래밍I', '관계기반 문제해결 1', 10, 1, 'performance', NULL, 5),
    ('프로그래밍I', '탐색기반 문제해결 2', 10, 1, 'performance', NULL, 6),
    ('프로그래밍I', '관계기반 문제해결 2', 10, 1, 'performance', NULL, 7),
    ('국어II', '고전문학 큐레이션', 20, 1, 'performance', NULL, 1),
    ('국어II', '법률 개정문 작성', 10, 1, 'performance', NULL, 2),
    ('국어II', '논증하는 글쓰기', 30, 1, 'performance', NULL, 3),
    ('국어II', '글쓰기 성찰', 10, 1, 'performance', NULL, 4),
    ('화학 및 실험II', '1회고사', 30, 1, 'written', 'midterm', 1),
    ('화학 및 실험II', '2회고사', 30, 1, 'written', 'final', 2),
    ('화학 및 실험II', '참여도', 6, 1, 'performance', NULL, 3),
    ('화학 및 실험II', '실험', 24, 1, 'performance', NULL, 4),
    ('화학 및 실험II', '자기주도학습', 10, 1, 'performance', NULL, 5),
    ('물리학 및 실험II', '1회고사', 30, 1, 'written', 'midterm', 1),
    ('물리학 및 실험II', '2회고사', 30, 1, 'written', 'final', 2),
    ('물리학 및 실험II', '성찰일지', 10, 1, 'performance', NULL, 3),
    ('물리학 및 실험II', '실험', 30, 1, 'performance', NULL, 4),
    ('수학IV', '1회고사', 100, 0.3, 'written', 'midterm', 1),
    ('수학IV', '2회고사', 100, 0.3, 'written', 'final', 2),
    ('수학IV', '기하개념탐구', 20, 1, 'performance', NULL, 3),
    ('수학IV', '수학일기', 5, 1, 'performance', NULL, 4),
    ('수학IV', '문제해결', 10, 1, 'performance', NULL, 5),
    ('수학IV', '독서기반탐구', 5, 1, 'performance', NULL, 6),
    ('지구과학 및 실험II', '1회고사', 100, 0.25, 'written', 'midterm', 1),
    ('지구과학 및 실험II', '2회고사', 100, 0.25, 'written', 'final', 2),
    ('지구과학 및 실험II', '지층전 촬영', 20, 1, 'performance', NULL, 3),
    ('지구과학 및 실험II', '지질탐사 계획 및 발표', 15, 1, 'performance', NULL, 4),
    ('지구과학 및 실험II', '조석 패턴 분석', 15, 1, 'performance', NULL, 5),
    ('영어II', '프로젝트 1', 10, 1, 'performance', NULL, 1),
    ('영어II', '프로젝트 2', 10, 1, 'performance', NULL, 2),
    ('영어II', '프로젝트 3', 10, 1, 'performance', NULL, 3)
), updated AS (
  UPDATE assessment_items AS item
  SET points = confirmed.points, weight = confirmed.weight, repeat_count = 1,
      kind = confirmed.kind, exam_slot = confirmed.exam_slot,
      needs_confirmation = false, sort_order = confirmed.sort_order
  FROM confirmed JOIN subjects ON subjects.name = confirmed.subject_name
  WHERE item.subject_id = subjects.id AND item.name = confirmed.name
  RETURNING item.id
)
INSERT INTO assessment_items
  (subject_id, name, points, weight, repeat_count, kind, exam_slot, needs_confirmation, sort_order)
SELECT subjects.id, confirmed.name, confirmed.points, confirmed.weight, 1,
       confirmed.kind, confirmed.exam_slot, false, confirmed.sort_order
FROM confirmed JOIN subjects ON subjects.name = confirmed.subject_name
WHERE NOT EXISTS (
  SELECT 1 FROM assessment_items
  WHERE subject_id = subjects.id AND name = confirmed.name
);

INSERT INTO assessment_items
  (subject_id, name, points, weight, repeat_count, kind, exam_slot, needs_confirmation, sort_order)
SELECT id, '', NULL, 1, 1, 'performance', NULL, true, 1
FROM subjects
WHERE name = '미술'
  AND NOT EXISTS (SELECT 1 FROM assessment_items WHERE subject_id = subjects.id);

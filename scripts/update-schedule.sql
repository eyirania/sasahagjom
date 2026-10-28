-- 2학기 배점표 반영 (영어II, 국어II, 생명과학II). 여러 번 실행해도 안전.
-- 과목 이름으로 찾기 때문에 id가 달라도 동작한다.
BEGIN;

-- 이름으로 항목을 만들거나(없을 때) 갱신하는 도우미
CREATE TEMP TABLE _plan (
  subject_like text, name text, points numeric, weight numeric,
  kind text, exam_slot text, sort_order int
) ON COMMIT DROP;

INSERT INTO _plan VALUES
  -- 영어II: 프로젝트 3개(각 100점 만점, 반영 10%) + 2회고사 50% + Discussion 20점
  ('영어II%', '프로젝트 1',  100, 0.1, 'performance', NULL,    1),
  ('영어II%', '프로젝트 2',  100, 0.1, 'performance', NULL,    2),
  ('영어II%', '프로젝트 3',  100, 0.1, 'performance', NULL,    3),
  ('영어II%', '2회고사',     100, 0.5, 'written',     'final', 4),
  ('영어II%', 'Discussion',   20, 1.0, 'performance', NULL,    5),
  -- 국어II: 수행 100점
  ('국어II%', '고전문학 큐레이션', 20, 1.0, 'performance', NULL, 1),
  ('국어II%', '법률 개정문 작성',  10, 1.0, 'performance', NULL, 2),
  ('국어II%', '비평적 독서토론',   20, 1.0, 'performance', NULL, 3),
  ('국어II%', '논증하는 글쓰기',   30, 1.0, 'performance', NULL, 4),
  ('국어II%', '글쓰기 성찰',       10, 1.0, 'performance', NULL, 5),
  ('국어II%', '감상 공유',         10, 1.0, 'performance', NULL, 6),
  -- 생명과학II: 1·2회고사 30%씩 + 실험 20점 x 2 (이미 같은 값이면 변화 없음)
  ('생명과학%', '1회고사', 100, 0.3, 'written',     'midterm', 1),
  ('생명과학%', '2회고사', 100, 0.3, 'written',     'final',   2),
  ('생명과학%', '실험I',    20, 1.0, 'performance', NULL,      3),
  ('생명과학%', '실험II',   20, 1.0, 'performance', NULL,      4);

-- (영어II 프로젝트 점수의 10점→100점 환산은 CSV에서 가져올 때 import-merge.sh가 한 번만 처리한다)

-- 이미 있는 항목 갱신
UPDATE assessment_items ai
SET points = p.points, weight = p.weight, kind = p.kind, exam_slot = p.exam_slot,
    sort_order = p.sort_order, needs_confirmation = false
FROM _plan p, subjects s
WHERE s.name LIKE p.subject_like AND ai.subject_id = s.id AND ai.name = p.name;

-- 없는 항목 추가
INSERT INTO assessment_items (subject_id, name, points, repeat_count, kind, exam_slot, needs_confirmation, sort_order, weight)
SELECT s.id, p.name, p.points, 1, p.kind, p.exam_slot, false, p.sort_order, p.weight
FROM _plan p JOIN subjects s ON s.name LIKE p.subject_like
WHERE NOT EXISTS (
  SELECT 1 FROM assessment_items ai WHERE ai.subject_id = s.id AND ai.name = p.name
);

COMMIT;

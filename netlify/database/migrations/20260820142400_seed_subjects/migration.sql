INSERT INTO subjects (name, category, credits, grading_type, sort_order) VALUES
  ('국어II', '국어', 3, 'letter', 1),
  ('물리학 및 실험II', '물리', 3, 'letter', 2),
  ('미술', '예술체육', 2, 'letter', 3),
  ('생명과학 및 실험II', '생명과학', 3, 'letter', 4),
  ('수학III', '수학', 2, 'letter', 5),
  ('수학IV', '수학', 3, 'letter', 6),
  ('영어II', '외국어', 3, 'letter', 7),
  ('인문자연탐사I', '인문자연탐사', 1, 'pass_fail', 8),
  ('지구과학 및 실험II', '지구과학', 3, 'letter', 9),
  ('창의탐구II', '창의탐구', 3, 'letter', 10),
  ('체육II', '예술체육', 1, 'pass_fail', 11),
  ('프로그래밍I', '정보과학', 3, 'letter', 12),
  ('한국사II', '사회', 1, 'letter', 13),
  ('화학 및 실험II', '화학', 3, 'letter', 14);

INSERT INTO assessment_items (subject_id, name, points, repeat_count, kind, exam_slot, needs_confirmation, sort_order)
SELECT id, '확인 필요', 0, 1, CASE WHEN grading_type = 'pass_fail' THEN 'performance' ELSE 'written' END, NULL, true, 1
FROM subjects;

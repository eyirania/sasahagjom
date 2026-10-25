-- Netlify 시절 데이터 보정 (여러 번 실행해도 안전)
-- 이름이 "1회고사"/"2회고사"인 항목은 지필고사로 취급하고 시험 구분(exam_slot)을 채운다.
UPDATE assessment_items
SET kind = 'written',
    exam_slot = CASE WHEN name LIKE '1회고사%' THEN 'midterm' ELSE 'final' END
WHERE name ~ '^[12]회고사'
  AND (kind <> 'written' OR exam_slot IS NULL);

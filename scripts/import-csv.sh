#!/usr/bin/env bash
# Netlify DB에서 내보낸 CSV 5개를 맥미니 DB로 옮긴다.
# 사용: DATABASE_URL=postgres://... ./scripts/import-csv.sh <CSV가 있는 폴더>
# 폴더에는 subjects.csv, assessment_items.csv, students.csv, student_scores.csv,
# student_subject_results.csv 가 있어야 하고, 첫 줄(헤더)은 DB 컬럼 이름이어야 한다.
# 먼저 `pnpm migrate`로 테이블을 만든 뒤 실행한다. 기존 데이터(마이그레이션이 넣은 기본 과목 포함)는 지우고 덮어쓴다.
set -euo pipefail
DIR="${1:?CSV 폴더 경로를 넣어줘}"
: "${DATABASE_URL:?DATABASE_URL이 필요해}"
TABLES=(subjects assessment_items students student_scores student_subject_results)

for t in "${TABLES[@]}"; do
  [ -f "$DIR/$t.csv" ] || { echo "없는 파일: $DIR/$t.csv" >&2; exit 1; }
done

{
  echo "BEGIN;"
  echo "TRUNCATE subjects, assessment_items, students, student_scores, student_subject_results RESTART IDENTITY CASCADE;"
  for t in "${TABLES[@]}"; do
    cols=$(head -1 "$DIR/$t.csv" | tr -d '\r' | sed 's/"//g')
    echo "\\copy $t($cols) FROM '$DIR/$t.csv' WITH (FORMAT csv, HEADER true)"
  done
  # id를 직접 넣었으니 serial 번호를 맞춰 둔다
  for t in "${TABLES[@]}"; do
    echo "SELECT setval(pg_get_serial_sequence('$t','id'), COALESCE((SELECT MAX(id) FROM $t), 1), (SELECT COUNT(*) > 0 FROM $t));"
  done
  echo "COMMIT;"
} | psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$(dirname "$0")/fix-data.sql"

for t in "${TABLES[@]}"; do
  printf '%-26s %s행\n' "$t" "$(psql "$DATABASE_URL" -tAc "SELECT COUNT(*) FROM $t")"
done

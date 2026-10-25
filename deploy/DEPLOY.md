# 맥미니 배포 가이드

(리눅스 사용자명이 `heun`이 아니면 `sasahagjom.service`의 User/경로를 바꿔.)

## 1. 준비
```bash
sudo apt update && sudo apt install -y postgresql git curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
sudo npm i -g pnpm
```

## 2. DB
```bash
sudo -u postgres psql -c "CREATE USER sasa WITH PASSWORD '여기에비번';"
sudo -u postgres psql -c "CREATE DATABASE sasa OWNER sasa;"
```

## 3. 코드 + 환경변수
```bash
cd ~ && git clone <저장소 주소> sasahagjom && cd sasahagjom
cp deploy/env.example .env && chmod 600 .env && nano .env
set -a; . ./.env; set +a
pnpm install && pnpm build && pnpm migrate
```

## 4. Google 로그인 (Google Cloud Console)
APIs & Services → OAuth 동의 화면 → 사용자 유형 "외부"(또는 Workspace면 내부), 게시 상태 "프로덕션".
사용자 인증 정보 → OAuth 클라이언트 ID(웹 애플리케이션) 생성:
- 승인된 리디렉션 URI: `https://hahyn.com/p/sahak/auth/callback`
- 나온 클라이언트 ID/비밀번호를 `.env`에 넣기

## 5. 서비스 등록
```bash
sudo cp deploy/sasahagjom.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now sasahagjom
systemctl status sasahagjom
curl -I http://127.0.0.1:5000/p/sahak/login   # 200
```

## 6. Caddy (/etc/caddy/Caddyfile의 :8080 블록 안에 추가)
```
redir /p/sahak /p/sahak/
handle /p/sahak/* {
    reverse_proxy 127.0.0.1:5000
}
```
`handle_path`가 아니라 `handle` (접두어를 지우면 안 됨). 적용: `sudo systemctl reload caddy`

## 7. 기존 데이터 옮기기 (Netlify DB → 맥미니)
Netlify 에이전트에게: "subjects, assessment_items, students, student_scores, student_subject_results 5개 테이블을 id 포함해서 헤더 있는 CSV로 내보내 줘" 라고 해서 받기.
(학생 성적이 들어 있으니 GitHub/채팅에 올리지 말고 맥미니로 직접 옮겨.)
```bash
mkdir -p ~/import && # 여기에 CSV 5개 복사
set -a; . ./.env; set +a
./scripts/import-csv.sh ~/import
shred -u ~/import/*.csv
```
학생은 처음 로그인할 때 이메일로 기존 기록과 자동 연결돼.

## 8. 백업 (매일 새벽 4시)
`crontab -e`:
```
0 4 * * * set -a; . /home/heun/sasahagjom/.env; set +a; /home/heun/sasahagjom/scripts/backup.sh
```

## 업데이트
```bash
cd ~/sasahagjom && git pull && pnpm install && pnpm build && pnpm migrate && sudo systemctl restart sasahagjom
```
Netlify 사이트는 새 서버가 확인될 때까지 켜 둬.

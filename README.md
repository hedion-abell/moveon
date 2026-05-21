# MOVE-ON 건강한 생활 앱

초등 1~2학년 학생들이 운동 기록, 감정 기록, 목표 확인을 할 수 있고, 교사와 관리자가 학생 기록을 확인할 수 있는 React 기반 웹앱입니다.

## 포함 파일

```text
move-on-health-app/
├─ index.html
├─ package.json
├─ src/
│  ├─ main.jsx
│  ├─ App.jsx
│  └─ style.css
└─ README.md
```

## GitHub 업로드 방법

1. GitHub 저장소에서 **Add file → Upload files**를 누릅니다.
2. 이 압축파일을 푼 뒤, 폴더 안의 파일과 폴더 전체를 업로드합니다.
3. `Commit changes`를 누릅니다.

## Vercel 배포 설정

Vercel에서 GitHub 저장소를 연결한 뒤 아래처럼 설정하면 됩니다.

- Framework Preset: `Vite`
- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm install`

## 테스트 계정

- 학생: `김민준` / `1234`
- 교사: `김선생` / `teacher1`
- 관리자: `관리자` / `master`

## 주의

현재 버전은 브라우저 안에서만 상태를 관리하는 테스트 버전입니다.  
새로고침하거나 다른 기기에서 접속하면 실제 데이터가 저장·공유되지 않을 수 있습니다.  
학생별 실제 기록 저장, 교사 계정 연동, 여러 기기 동기화가 필요하면 Firebase, Supabase 같은 데이터베이스 연결이 추가로 필요합니다.

# MOVE-ON 건강 기록 앱 - Firebase / AI 버전

첨부된 React 소스를 GitHub와 Vercel에 올릴 수 있도록 Vite 프로젝트 형태로 정리한 파일입니다.

## 포함 기능

- React 기반 MOVE-ON 건강 기록 앱
- Firebase Firestore 데이터 저장/불러오기
- 학생/교사/관리자 로그인 화면
- 학생 운동 기록, 감정 기록, 목표 관리
- 교사용 현황표, 명렬표, 달력, 순위, 메시지
- 관리자용 학년/반/운동 종목/학생 관리
- AI 응원 메시지 호출 코드 포함

## 로컬 실행

```bash
npm install
npm run dev
```

## GitHub 업로드 방법

1. 이 폴더 안의 파일 전체를 GitHub 저장소에 업로드합니다.
2. `node_modules` 폴더는 업로드하지 않습니다.
3. GitHub에 올라가야 할 주요 파일은 `index.html`, `package.json`, `src/App.jsx`, `src/main.jsx`, `src/style.css`입니다.

## Vercel 배포 방법

1. Vercel에서 GitHub 저장소를 Import합니다.
2. Framework Preset은 `Vite`로 선택합니다.
3. Build Command는 `npm run build`입니다.
4. Output Directory는 `dist`입니다.

## 주의 사항

현재 소스에는 Firebase 설정값이 코드에 직접 포함되어 있습니다. Firebase 웹 앱 설정값 자체는 일반적으로 클라이언트에 포함될 수 있지만, Firestore 보안 규칙을 반드시 설정해야 합니다.

또한 Anthropic API를 브라우저에서 직접 호출하는 방식은 실제 배포 환경에서 CORS 또는 API 키 보안 문제로 작동하지 않을 수 있습니다. 안정적으로 사용하려면 Vercel Serverless Function 같은 서버 API를 만들어 호출하는 방식으로 바꾸는 것이 좋습니다.

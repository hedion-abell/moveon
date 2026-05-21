# MOVE-ON 건강 생활 앱

첨부된 React 소스를 GitHub와 Vercel에 업로드할 수 있도록 정리한 Vite + React 프로젝트입니다.

## 실행 방법

```bash
npm install
npm run dev
```

## Vercel 배포 설정

- Framework Preset: `Vite`
- Build Command: `npm run build`
- Output Directory: `dist`

## 학생 일괄 등록 파일 형식

관리자 화면의 학생 일괄 등록은 CSV 형식 기준입니다.
엑셀에서 아래 열 순서로 작성한 뒤 **CSV UTF-8** 형식으로 저장해 업로드하세요.

```csv
학년,반,번호,이름,성별
1,1,1,김민준,남
1,1,2,이서연,여
```

## 테스트 계정

- 학생: `김민준` / `1234`
- 교사: `김선생` / `teacher1`
- 관리자: `관리자` / `master`

# TaskTray

개인 업무 스케줄 관리 프로그램. Windows 시스템 트레이에 상주하며, 트레이 아이콘 클릭 시
화면 우측 하단에 세로형 패널을 띄워 수시 업무를 즉시 메모하고 flow(사내 SaaS) 등록 여부를
추적하며, 누적 실적을 리포트로 내보내는 초경량 개인용 도구입니다.

v1.4.0부터 **웹/모바일(PWA)** 과 **다기기 클라우드 동기화(Supabase)** 를 지원합니다 — 웹앱: `tasktray.vercel.app`.

> - 요구사항 기준: [`개인업무관리프로그램_요구사항정의서.md`](개인업무관리프로그램_요구사항정의서.md)
> - 버전별 변경 이력: [`CHANGELOG.md`](CHANGELOG.md)
> - 작업 원칙·결정 로그·이어서 개발 가이드: [`CLAUDE.md`](CLAUDE.md)
> - 동기화 백엔드 설정: [`supabase/README.md`](supabase/README.md)

## 기술 스택

- **Tauri 2.x** (Rust backend + Web frontend)
- **TypeScript + React + Vite** (프론트엔드)
- 데이터 저장: 로컬 JSON 파일 (`tasks.json`, `settings.json`)
- 패키징: Tauri bundler → **NSIS 설치파일(.exe)**, per-user 설치

## 사전 준비 (개발 환경)

1. **Node.js** 20+ 및 **pnpm** (`npm i -g pnpm`)
2. **Rust** (rustup) — `stable-x86_64-pc-windows-msvc` 툴체인
   ```powershell
   winget install Rustlang.Rustup
   rustup default stable-msvc
   ```
3. **Visual Studio Build Tools 2022** — C++ 빌드 도구 + Windows SDK (관리자 권한 필요)
   ```powershell
   winget install Microsoft.VisualStudio.2022.BuildTools --override "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
   ```
4. **WebView2 Runtime** — Windows 11 기본 탑재(대부분 설치 불필요)

## 설치

```powershell
pnpm install
```

## 개발 실행

개발 모드(핫 리로드)로 실행합니다. 실행하면 트레이에 아이콘이 상주합니다.

```powershell
pnpm tauri dev
```

프론트엔드 로직 단위 테스트:

```powershell
pnpm test
```

- 트레이 아이콘 **좌클릭**: 우측 하단 패널 열기/닫기
- 트레이 아이콘 **우클릭**: [열기] / [환경설정] / [로우데이터 보기] / [종료]
- 패널 바깥(다른 프로그램)을 클릭하면 패널이 숨겨지고, 프로그램은 트레이에 계속 상주합니다.
- 완전 종료는 트레이 우클릭 → [종료].

## 설치파일 빌드

NSIS 설치파일(.exe)을 생성합니다.

```powershell
pnpm tauri build
```

- 산출물: `src-tauri/target/release/bundle/nsis/TaskTray_1.4.0_x64-setup.exe`
- **per-user 설치**(관리자 권한 불필요), 시작 메뉴 등록·제거 지원.
- 미서명 설치파일이라 Windows SmartScreen 경고가 나올 수 있습니다(`추가 정보 → 실행`). 정상입니다.
- **단일 인스턴스**(NFR-02): 프로그램을 다시 실행하면 기존에 실행 중이던 인스턴스(구버전 포함)가 자동 종료되고 새 인스턴스 1개만 상주합니다.
- **버전업/재설치 후에도** `%APPDATA%\TaskTray` 의 데이터는 유지됩니다(설치 폴더 밖에서 관리).

## 데이터 저장 위치

- 모든 데이터(`tasks.json`, `tasks.backup.json`, `settings.json`)는 **앱이 `%APPDATA%\TaskTray` 폴더에서 자동 관리**합니다. 사용자가 경로를 지정할 필요가 없습니다.
- 환경설정의 **[저장 폴더 열기]** 버튼으로 이 폴더를 탐색기에서 열 수 있습니다.
- 프로그램을 제거·재설치·버전업해도 이 폴더의 데이터는 유지됩니다.
- 모든 시각은 항상 KST(+09:00)로 기록됩니다.
- 저장은 임시파일 교체(atomic write) 방식이며, `tasks.json`은 직전 버전 1개를 자동 백업합니다.

## 프로젝트 구조

```
tasktray/
├─ index.html
├─ src/                       프론트엔드 (TypeScript + React)
│  ├─ main.tsx                창 라벨별 화면 라우팅
│  ├─ styles.css
│  └─ windows/
│     ├─ Panel.tsx            메인 패널 (트레이 좌클릭)
│     ├─ Settings.tsx         환경설정 창
│     └─ RawData.tsx          로우데이터 창
└─ src-tauri/                 백엔드 (Rust)
   ├─ tauri.conf.json
   ├─ Cargo.toml
   ├─ capabilities/default.json
   └─ src/
      ├─ main.rs
      ├─ lib.rs               앱 부트스트랩·전역 상태
      ├─ tray.rs              트레이 아이콘·메뉴
      └─ window.rs            패널 위치/토글·포커스 아웃·창 생성
```

## 개발 진행 상황 (마일스톤)

| 단계 | 내용 | 상태 |
|:--:|------|:--:|
| M1 | 프로젝트 초기화 + 트레이 상주/패널 토글/우클릭 메뉴 골격 | ✅ |
| M2 | 데이터 계층 (저장 경로 지정, JSON 읽기·쓰기, atomic write + 백업) | ✅ |
| M3 | Task 핵심 기능 (FR-01~12) | ✅ |
| M4 | flow 워크플로우 (상태 흐름) | ✅ |
| M5 | 로우데이터 화면 + 실적 리포트 (FR-13~19) | ✅ |
| M6 | 환경설정 (FR-24~28) | ✅ |
| M7 | 단일 인스턴스 + NSIS 패키징 | ✅ |

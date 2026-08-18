# 외부 PC에서 이어서 개발하기 (셋업 가이드)

회사 PC 말고 **다른 PC에서 TaskTray 코드를 이어서 개발**할 때의 준비 순서입니다.
(업무 데이터가 아니라 **코드**를 이어받는 방법입니다. 데이터는 로그인만 하면 어디서든 같습니다.)

---

## 0. 미리 깔려 있어야 하는 것

| 하려는 작업 | 필요한 프로그램 |
|---|---|
| **웹/모바일(PWA)만** 수정 | Git, Node.js(20+), pnpm  ← 이거면 충분 |
| **데스크톱 앱** 실행·설치파일 빌드 | 위 + **Rust**(rustup, stable-x86_64-pc-windows-msvc) + **Visual Studio Build Tools 2022**(C++ 워크로드) + **WebView2 런타임** |

> pnpm 설치: `npm i -g pnpm`
> Rust 설치: `winget install Rustlang.Rustup` 후 `rustup default stable-msvc`
> Build Tools(관리자 필요): `winget install Microsoft.VisualStudio.2022.BuildTools --override "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"`
> ※ Rust/Build Tools 설치 후에는 **새 터미널**을 열어야 인식됩니다.

---

## 1. 코드 받기

```powershell
# (A) 그 PC에서 처음 받는 경우 — clone
git clone https://github.com/bts7623/tasktray.git
cd tasktray

# (B) 이미 받아둔 적 있는 경우 — 최신으로 갱신
cd tasktray
git pull
```

> "checkout"이 아니라 **처음이면 clone / 이미 있으면 pull** 입니다.

---

## 2. 의존성 설치

```powershell
pnpm install
```

---

## 3. `.env.local` 다시 만들기 ⚠️ (제일 자주 빠뜨리는 것)

`.env.local`은 **보안상 git에 올라가지 않습니다.** 그래서 새 PC에는 없으니 **직접 만들어야** 합니다.
(없으면 웹/동기화가 안 됩니다. 데스크톱 로컬 기능은 없어도 됩니다.)

프로젝트 루트(`tasktray/`)에 **`.env.local`** 파일을 만들고 아래 내용을 넣으세요:

```
VITE_SUPABASE_URL=https://jiqmhtqjrtrytxdxxngm.supabase.co
VITE_SUPABASE_ANON_KEY=<Supabase anon public 키>
```

- 값은 Supabase 대시보드 → **Project Settings → API** 에서 복사.
- 회사 PC의 `.env.local`을 그대로 복사해 와도 됩니다.

---

## 4. 개발 시작

VSCode에서 `tasktray` 폴더를 열고 **Claude Code(CLI)** 를 실행한 뒤, **하고 싶은 작업을 그냥 말하면** 됩니다.
`CLAUDE.md`가 자동으로 읽히므로 맥락(구조·결정·버전)을 알고 시작합니다.

확실히 파악시키고 싶으면 이렇게 시작하세요:

```
이어서 개발할 거야. 먼저 CLAUDE.md의 '이어서 개발 시작하기' 섹션과 CHANGELOG.md를 보고
현재 구조·버전을 파악한 뒤 진행해줘.
```

### 실행/빌드 명령

| 목적 | 명령 |
|---|---|
| 웹 개발서버 | `pnpm dev` (브라우저에서 확인) |
| 웹 빌드 | `pnpm build` |
| 데스크톱 실행(개발) | `pnpm tauri dev` |
| 데스크톱 설치파일 빌드 | `pnpm tauri build` |
| 테스트 | `pnpm test` |

---

## 5. 작업 끝나면 저장·업로드

```powershell
git add -A
git commit -m "작업 내용"
git push
```

---

## 6. 두 PC 오가며 쓸 때 충돌 방지 (중요)

- **작업 시작 전 항상 `git pull`**, **끝나면 `git push`**.
- 이것만 지키면 회사 PC ↔ 외부 PC 코드가 어긋나지 않습니다.
- 깜빡하고 양쪽에서 다르게 고치면 병합(merge) 충돌이 날 수 있습니다.

---

## 한 장 요약

```
git clone(첫 PC) 또는 git pull
  → pnpm install
  → .env.local 재생성 (Supabase URL·키)
  → (데스크톱 빌드하려면 Rust + Build Tools)
  → VSCode로 폴더 열고 Claude Code 실행 → 작업
  → git add/commit/push
```

## 참고 문서

- 결정 로그·아키텍처: [CLAUDE.md](CLAUDE.md) (자동 로드됨)
- 버전별 변경: [CHANGELOG.md](CHANGELOG.md)
- 요구사항: [개인업무관리프로그램_요구사항정의서.md](개인업무관리프로그램_요구사항정의서.md)
- 동기화 백엔드: [supabase/README.md](supabase/README.md)

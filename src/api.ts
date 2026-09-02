// 백엔드(invoke) 커맨드 래퍼 및 데이터 타입 (M2)
// 필드명은 Rust serde(camelCase) 와 tasks.json 스키마(§6.1/§6.2)에 1:1 대응한다.

import { invoke } from "@tauri-apps/api/core";

export interface Theme {
  backgroundColor: string;
  textColor: string;
  fontSize: number;
}

export interface WindowSize {
  width: number;
  height: number;
  x?: number | null;
  y?: number | null;
}

export interface MemoSize {
  width: number;
  height: number;
  x?: number | null;
  y?: number | null;
}

export interface Settings {
  dataPath: string | null;
  theme: Theme;
  window: WindowSize;
  autoStart: boolean;
  titleAutoParse: boolean;
  shortcut: string;
  /** 환경설정 창 열기 단축키. (D-27) */
  shortcutSettings: string;
  /** 개인 메모 창 열기 단축키. (D-27) */
  shortcutMemo: string;
  alwaysOnTop: boolean;
  opacity: number;
  categoryColors: Record<string, string>;
  memo: MemoSize;
  /** 환경설정 창 크기. (D-27) */
  settingsSize: MemoSize;
  /** 메모 글자 크기(px). 앱 화면·환경설정과 별도. (D-25) */
  memoFontSize: number;
  /** 환경설정 창 글자 크기(px). 앱 화면·메모와 별도. (D-25) */
  settingsFontSize: number;
  /** 메모 비밀번호 재입력 주기(분). 0=매번, -1=앱 종료할 때까지, n>0=n분. (D-28) */
  memoLockMinutes: number;
  /** 앱 폰트 종류(빈 문자열=시스템 기본). (D-30) */
  fontFamily: string;
}

export interface Task {
  id: string;
  title: string;
  category: string | null;
  status: "active" | "done" | "archived";
  pinned: boolean;
  dueDate: string | null;
  createdAt: string;
  completedAt: string | null;
  flowStatus: null | "registered" | "excluded";
  flowProcessedAt: string | null;
  deleted: boolean;
  deletedAt: string | null;
  updatedAt: string; // 마지막 변경 시각(KST). 동기화 충돌 판정용 (schema v2)
}

export interface TasksFile {
  schemaVersion: number;
  tasks: Task[];
}

export interface TasksLoad {
  file: TasksFile;
  source: "primary" | "backup" | "new";
  message: string | null;
}

export const getSettings = () => invoke<Settings>("get_settings");

/** 앱이 자동 관리하는 데이터 폴더 경로(%APPDATA%\TaskTray). */
export const getDataDir = () => invoke<string>("get_data_dir");

/** 데이터 폴더를 탐색기로 연다. (환경설정 [저장 폴더 열기]) */
export const openDataFolder = () => invoke<void>("open_data_folder");

export const loadTasks = () => invoke<TasksLoad>("load_tasks");

export const saveTasks = (file: TasksFile) => invoke<void>("save_tasks", { file });

export const saveSettings = (settings: Settings) =>
  invoke<void>("save_settings", { settings });

/** 임의 경로에 텍스트 파일 저장 (리포트 내보내기, FR-19). */
export const writeTextFile = (path: string, contents: string) =>
  invoke<void>("write_text_file", { path, contents });

/** Windows 시작 시 자동 실행 등록/해제 (FR-27). */
export const setAutostart = (enabled: boolean) =>
  invoke<void>("set_autostart", { enabled });

/** 앱 버전 문자열 (NFR-04). */
export const appVersion = () => invoke<string>("app_version");

/** 글로벌 단축키 변경(충돌 시 에러 반환). kind: "panel" | "settings" | "memo". (D-27) */
export const setShortcut = (kind: "panel" | "settings" | "memo", accelerator: string) =>
  invoke<void>("set_shortcut", { kind, accelerator });

/** 패널 항상 위 고정(압정) 설정. */
export const setPanelPinned = (pinned: boolean) =>
  invoke<void>("set_panel_pinned", { pinned });

/** 환경설정 창 열기(헤더 톱니바퀴). */
export const openSettings = () => invoke<void>("open_settings");

/** 사용 설명서 창 열기(제목 클릭). */
export const openHelp = () => invoke<void>("open_help");

/** 피드백 관리 창 열기(관리자, D-23). */
export const openFeedback = () => invoke<void>("open_feedback");

/** 개인 메모 창 열기(헤더 메모 아이콘, D-24). */
export const openMemo = () => invoke<void>("open_memo");

/** 암호화된 메모 파일 읽기(없으면 null). */
export const readMemo = () => invoke<string | null>("read_memo");

/** 암호화된 메모 문자열 저장. */
export const saveMemo = (contents: string) => invoke<void>("save_memo", { contents });

/** 메모 비밀번호 세션이 유효한지(주기 내) 확인. (D-28) */
export const memoSessionValid = () => invoke<boolean>("memo_session_valid");

/** 메모 비밀번호 검증 성공 시 세션 해제 시각 기록. (D-28) */
export const memoMarkUnlocked = () => invoke<void>("memo_mark_unlocked");

/** 메모 세션 즉시 종료([잠그기]). (D-28) */
export const memoLock = () => invoke<void>("memo_lock");

/** 기본 설정값(초기화용, FR-28). dataPath 는 호출부에서 현재 값을 유지한다. */
export function defaultSettings(): Omit<Settings, "dataPath"> {
  return {
    theme: { backgroundColor: "#1e1e1e", textColor: "#e0e0e0", fontSize: 14 },
    window: { width: 360, height: 720 },
    autoStart: false,
    titleAutoParse: false,
    shortcut: "Ctrl+Alt+Space",
    shortcutSettings: "Ctrl+Alt+S",
    shortcutMemo: "Ctrl+Alt+M",
    alwaysOnTop: false,
    opacity: 1,
    categoryColors: {},
    memo: { width: 400, height: 520 },
    settingsSize: { width: 500, height: 780 },
    memoFontSize: 14,
    settingsFontSize: 14,
    memoLockMinutes: 0,
    fontFamily: "",
  };
}

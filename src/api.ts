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

export interface Settings {
  dataPath: string | null;
  theme: Theme;
  window: WindowSize;
  autoStart: boolean;
  titleAutoParse: boolean;
  shortcut: string;
  alwaysOnTop: boolean;
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

/** 글로벌 단축키 변경(충돌 시 에러 반환). */
export const setShortcut = (accelerator: string) =>
  invoke<void>("set_shortcut", { accelerator });

/** 패널 항상 위 고정(압정) 설정. */
export const setPanelPinned = (pinned: boolean) =>
  invoke<void>("set_panel_pinned", { pinned });

/** 기본 설정값(초기화용, FR-28). dataPath 는 호출부에서 현재 값을 유지한다. */
export function defaultSettings(): Omit<Settings, "dataPath"> {
  return {
    theme: { backgroundColor: "#1e1e1e", textColor: "#e0e0e0", fontSize: 14 },
    window: { width: 360, height: 720 },
    autoStart: false,
    titleAutoParse: false,
    shortcut: "Ctrl+Alt+Space",
    alwaysOnTop: false,
  };
}

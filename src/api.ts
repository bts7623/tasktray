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
}

export interface Settings {
  dataPath: string | null;
  theme: Theme;
  window: WindowSize;
  autoStart: boolean;
  titleAutoParse: boolean;
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

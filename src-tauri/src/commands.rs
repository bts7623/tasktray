// 프론트엔드에서 호출하는 invoke 커맨드 (M2 데이터 계층)

use std::sync::atomic::Ordering;
use std::sync::mpsc;

use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

use crate::storage::{self, Settings, TasksFile, TasksLoad};
use crate::AppState;

/// settings.json 로드. `dataPath` 가 null 이면 프론트가 최초 실행으로 판단한다.
#[tauri::command]
pub fn get_settings(app: AppHandle) -> Settings {
    storage::load_settings(&app)
}

/// 저장 폴더 기본 경로(%APPDATA%\TaskTray)를 문자열로 반환. (D-05 취소 시 사용)
#[tauri::command]
pub fn default_data_dir(app: AppHandle) -> Result<String, String> {
    Ok(storage::app_dir(&app)?.to_string_lossy().to_string())
}

/// 네이티브 폴더 선택 다이얼로그. 표시 중에는 패널 포커스 아웃 숨김을 억제한다. (FR-20, D-03)
/// 선택하면 경로 문자열, 취소하면 null 을 반환한다.
#[tauri::command]
pub async fn choose_data_folder(app: AppHandle) -> Option<String> {
    // 다이얼로그로 포커스가 넘어가도 패널을 숨기지 않도록 억제 플래그 설정
    if let Some(state) = app.try_state::<AppState>() {
        state.suppress_panel_hide.store(true, Ordering::SeqCst);
    }

    let (tx, rx) = mpsc::channel();
    app.dialog().file().pick_folder(move |folder| {
        let _ = tx.send(folder);
    });
    let picked = rx.recv().ok().flatten();

    if let Some(state) = app.try_state::<AppState>() {
        state.suppress_panel_hide.store(false, Ordering::SeqCst);
    }

    picked
        .and_then(|p| p.into_path().ok())
        .map(|p| p.to_string_lossy().to_string())
}

/// 저장 폴더를 확정한다. path 가 None 이면 기본 경로를 사용한다. (FR-20, FR-22)
/// dataPath 를 settings 에 기록하고, 해당 폴더에 tasks.json 이 없으면 빈 파일을 생성한다.
#[tauri::command]
pub fn init_data(app: AppHandle, path: Option<String>) -> Result<Settings, String> {
    let dir = match path {
        Some(p) if !p.trim().is_empty() => p,
        _ => storage::app_dir(&app)?.to_string_lossy().to_string(),
    };

    storage::ensure_data_dir(&dir)?;

    let mut settings = storage::load_settings(&app);
    settings.data_path = Some(dir);
    storage::save_settings(&app, &settings)?;
    Ok(settings)
}

/// tasks.json 로드. dataPath 미설정 시 에러. 손상 시 백업 폴백. (DR-04)
#[tauri::command]
pub fn load_tasks(app: AppHandle) -> Result<TasksLoad, String> {
    let settings = storage::load_settings(&app);
    let dir = settings
        .data_path
        .ok_or_else(|| "저장 폴더가 아직 지정되지 않았습니다.".to_string())?;
    storage::load_tasks(&dir)
}

/// tasks.json 저장. atomic write + 백업. (FR-23, DR-02)
#[tauri::command]
pub fn save_tasks(app: AppHandle, file: TasksFile) -> Result<(), String> {
    let settings = storage::load_settings(&app);
    let dir = settings
        .data_path
        .ok_or_else(|| "저장 폴더가 아직 지정되지 않았습니다.".to_string())?;
    storage::save_tasks(&dir, &file)
}

/// settings.json 저장. atomic write (백업 없음, D-07). (FR-26, DR-02)
#[tauri::command]
pub fn save_settings(app: AppHandle, settings: Settings) -> Result<(), String> {
    storage::save_settings(&app, &settings)
}

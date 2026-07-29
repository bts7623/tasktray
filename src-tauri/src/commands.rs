// 프론트엔드에서 호출하는 invoke 커맨드 (M2 데이터 계층)
//
// 저장 위치는 앱이 자동 관리한다: %APPDATA%\TaskTray (결정 D-08).
// 사용자는 경로를 지정하지 않으며, 환경설정의 [저장 폴더 열기]로 접근한다.

use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

use crate::storage::{self, Settings, TasksFile, TasksLoad};

/// 앱이 관리하는 데이터 폴더 경로(%APPDATA%\TaskTray) 문자열.
fn data_dir(app: &AppHandle) -> Result<String, String> {
    Ok(storage::app_dir(app)?.to_string_lossy().to_string())
}

/// settings.json 로드. dataPath 는 항상 관리 폴더로 채워 반환한다.
#[tauri::command]
pub fn get_settings(app: AppHandle) -> Result<Settings, String> {
    let mut s = storage::load_settings(&app);
    s.data_path = Some(data_dir(&app)?);
    Ok(s)
}

/// 관리 데이터 폴더 경로 반환(표시·안내용).
#[tauri::command]
pub fn get_data_dir(app: AppHandle) -> Result<String, String> {
    data_dir(&app)
}

/// 데이터 폴더를 탐색기로 연다. (환경설정 [저장 폴더 열기] 버튼, FR-16 성격)
#[tauri::command]
pub fn open_data_folder(app: AppHandle) -> Result<(), String> {
    let dir = data_dir(&app)?;
    storage::ensure_data_dir(&dir)?;
    app.opener()
        .open_path(dir, None::<&str>)
        .map_err(|e| format!("폴더 열기 실패: {e}"))
}

/// tasks.json 로드(폴더/파일 없으면 준비). 손상 시 백업 폴백. (DR-04)
#[tauri::command]
pub fn load_tasks(app: AppHandle) -> Result<TasksLoad, String> {
    let dir = data_dir(&app)?;
    storage::ensure_data_dir(&dir)?;
    storage::load_tasks(&dir)
}

/// tasks.json 저장. atomic write + 백업. (FR-23, DR-02)
#[tauri::command]
pub fn save_tasks(app: AppHandle, file: TasksFile) -> Result<(), String> {
    let dir = data_dir(&app)?;
    storage::ensure_data_dir(&dir)?;
    storage::save_tasks(&dir, &file)
}

/// settings.json 저장. atomic write (백업 없음, D-07). (FR-26, DR-02)
#[tauri::command]
pub fn save_settings(app: AppHandle, settings: Settings) -> Result<(), String> {
    storage::save_settings(&app, &settings)
}

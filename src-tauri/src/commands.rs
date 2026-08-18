// 프론트엔드에서 호출하는 invoke 커맨드 (M2 데이터 계층)
//
// 저장 위치는 앱이 자동 관리한다: %APPDATA%\TaskTray (결정 D-08).
// 사용자는 경로를 지정하지 않으며, 환경설정의 [저장 폴더 열기]로 접근한다.

use std::sync::atomic::Ordering;

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_global_shortcut::GlobalShortcutExt;
use tauri_plugin_opener::OpenerExt;

use crate::storage::{self, Settings, TasksFile, TasksLoad};
use crate::{window, AppState};

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

/// settings.json 저장 후 창 간 즉시 반영 이벤트 emit. (FR-26, DR-02)
#[tauri::command]
pub fn save_settings(app: AppHandle, settings: Settings) -> Result<(), String> {
    storage::save_settings(&app, &settings)?;
    // 모든 창(패널·설정·로우데이터)이 수신해 테마/창크기를 즉시 재적용한다.
    let _ = app.emit("settings-changed", &settings);
    Ok(())
}

/// Windows 시작 시 자동 실행 등록/해제. (FR-27)
#[tauri::command]
pub fn set_autostart(app: AppHandle, enabled: bool) -> Result<(), String> {
    let m = app.autolaunch();
    if enabled {
        m.enable().map_err(|e| format!("자동 실행 등록 실패: {e}"))
    } else {
        m.disable().map_err(|e| format!("자동 실행 해제 실패: {e}"))
    }
}

/// 임의 경로에 텍스트 파일 저장. 실적 리포트(Markdown/CSV) 내보내기용. (FR-19)
#[tauri::command]
pub fn write_text_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| format!("파일 저장 실패({path}): {e}"))
}

/// 앱 버전(Semantic Versioning) 반환. 환경설정 하단 표시용. (NFR-04)
#[tauri::command]
pub fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// 환경설정 창 열기(패널 헤더 톱니바퀴 버튼용).
/// 반드시 async + 메인 스레드 디스패치로 창을 생성한다. 동기 커맨드에서 창을 만들면
/// 메인 이벤트 루프가 블록되어 앱 전체가 데드락된다.
#[tauri::command]
pub async fn open_settings(app: AppHandle) {
    let a = app.clone();
    let _ = app.run_on_main_thread(move || window::open_settings(&a));
}

/// 사용 설명서 창 열기(패널 제목 클릭용). (동일하게 메인 스레드에서 생성)
#[tauri::command]
pub async fn open_help(app: AppHandle) {
    let a = app.clone();
    let _ = app.run_on_main_thread(move || window::open_help(&a));
}

/// 피드백 관리 창 열기(관리자용, D-23). (메인 스레드에서 생성)
#[tauri::command]
pub async fn open_feedback(app: AppHandle) {
    let a = app.clone();
    let _ = app.run_on_main_thread(move || window::open_feedback(&a));
}

/// 글로벌 단축키 변경. 기존 것을 해제하고 새 것을 등록한다.
/// 이미 다른 프로그램이 점유한 키면 등록이 실패하므로, 실패 시 이전 키로 되돌리고 에러를 반환한다.
/// (충돌 감지: 어떤 프로그램인지 이름은 알 수 없고 "사용 중" 여부만 판별 가능)
#[tauri::command]
pub fn set_shortcut(app: AppHandle, accelerator: String) -> Result<(), String> {
    let gs = app.global_shortcut();
    let old = storage::load_settings(&app).shortcut;

    // 기존 단축키 해제(있으면)
    let _ = gs.unregister(old.as_str());

    match gs.register(accelerator.as_str()) {
        Ok(_) => Ok(()),
        Err(e) => {
            // 실패 → 이전 단축키 복구
            let _ = gs.register(old.as_str());
            Err(format!(
                "이 단축키는 등록할 수 없습니다. 이미 다른 프로그램이 사용 중이거나 형식이 올바르지 않습니다. ({e})"
            ))
        }
    }
}

/// 패널 항상 위 고정(압정) 설정. always_on_top 적용 + 포커스아웃 숨김 억제 플래그 갱신.
#[tauri::command]
pub fn set_panel_pinned(app: AppHandle, pinned: bool) -> Result<(), String> {
    if let Some(state) = app.try_state::<AppState>() {
        state.panel_pinned.store(pinned, Ordering::SeqCst);
    }
    if let Some(win) = app.get_webview_window("main") {
        win.set_always_on_top(pinned)
            .map_err(|e| format!("항상 위 설정 실패: {e}"))?;
    }
    Ok(())
}

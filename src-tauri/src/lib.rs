// TaskTray - 개인 업무 스케줄 관리 프로그램
// M1: 트레이 상주 + 좌클릭 패널 토글 + 우클릭 메뉴 골격
// M2: 데이터 계층(settings/tasks 저장·로드, atomic write + 백업, 최초 폴더 지정)

mod commands;
mod storage;
mod tray;
mod window;

use std::sync::atomic::AtomicBool;

/// 앱 전역 상태.
/// `suppress_panel_hide`: 네이티브 다이얼로그(폴더 선택/파일 저장) 등으로 패널이
/// 포커스를 잃어도 숨기지 않아야 할 때 true 로 설정한다. (요구사항 결정 D-03)
pub struct AppState {
    pub suppress_panel_hide: AtomicBool,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            suppress_panel_hide: AtomicBool::new(false),
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::get_data_dir,
            commands::open_data_folder,
            commands::load_tasks,
            commands::save_tasks,
            commands::save_settings,
        ])
        .setup(|app| {
            tray::create_tray(app.handle())?;
            // 데이터 폴더/파일을 앱이 자동 준비한다(사용자 경로 지정 없음, D-08).
            if let Ok(dir) = storage::app_dir(app.handle()) {
                let _ = storage::ensure_data_dir(&dir.to_string_lossy());
            }
            // 시작 시 패널은 숨김 상태로 우측 하단에 미리 배치해 둔다.
            window::position_panel(app.handle());
            Ok(())
        })
        .on_window_event(window::handle_window_event)
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

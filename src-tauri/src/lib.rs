// TaskTray - 개인 업무 스케줄 관리 프로그램
// M1: 트레이 상주 + 좌클릭 패널 토글 + 우클릭 메뉴 골격
// M2: 데이터 계층(settings/tasks 저장·로드, atomic write + 백업, 최초 폴더 지정)
// M6: 환경설정(테마·창크기·자동실행·제목분리), 설정 즉시 반영(settings-changed 이벤트)

mod commands;
mod single_instance;
mod storage;
mod tray;
mod window;

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

use tauri::Manager;
use tauri_plugin_autostart::{ManagerExt, MacosLauncher};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

/// 앱 전역 상태.
/// `suppress_panel_hide`: 네이티브 다이얼로그(폴더 선택/파일 저장) 등으로 패널이
/// 포커스를 잃어도 숨기지 않아야 할 때 true 로 설정한다. (요구사항 결정 D-03)
/// `panel_pinned`: 압정 고정(항상 위) 상태. true면 포커스 아웃에도 숨기지 않는다.
pub struct AppState {
    pub suppress_panel_hide: AtomicBool,
    pub panel_pinned: AtomicBool,
    /// 창 이동 저장 디바운스용 세대 카운터.
    pub move_gen: AtomicU64,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 단일 인스턴스(NFR-02): 기존 인스턴스를 종료시키고 우리가 락을 확보한다.
    let instance_lock = single_instance::take_over();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None, // 시작 인자 없음
        ))
        .plugin(
            // 글로벌 단축키: 눌림(Pressed) 시 패널 토글 (사용자 확장 기능)
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        window::toggle_panel(app);
                    }
                })
                .build(),
        )
        .manage(AppState {
            suppress_panel_hide: AtomicBool::new(false),
            panel_pinned: AtomicBool::new(false),
            move_gen: AtomicU64::new(0),
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::get_data_dir,
            commands::open_data_folder,
            commands::load_tasks,
            commands::save_tasks,
            commands::save_settings,
            commands::write_text_file,
            commands::set_autostart,
            commands::app_version,
            commands::set_shortcut,
            commands::set_panel_pinned,
        ])
        .setup(move |app| {
            // 확보한 락 리스너로 이후 새 인스턴스의 종료 신호를 수신한다. (NFR-02)
            if let Some(listener) = instance_lock {
                single_instance::serve(app.handle(), listener);
            }
            tray::create_tray(app.handle())?;
            // 데이터 폴더/파일을 앱이 자동 준비한다(사용자 경로 지정 없음, D-08).
            if let Ok(dir) = storage::app_dir(app.handle()) {
                let _ = storage::ensure_data_dir(&dir.to_string_lossy());
            }
            // 자동 실행 등록 상태를 설정과 동기화한다. (FR-27)
            let settings = storage::load_settings(app.handle());
            let launcher = app.autolaunch();
            let _ = if settings.auto_start {
                launcher.enable()
            } else {
                launcher.disable()
            };

            // 글로벌 단축키 등록 + 압정(항상 위) 상태 적용
            let _ = app.global_shortcut().register(settings.shortcut.as_str());
            if let Some(state) = app.try_state::<AppState>() {
                state.panel_pinned.store(settings.always_on_top, Ordering::SeqCst);
            }
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_always_on_top(settings.always_on_top);
            }
            // 시작 시 패널 위치: 저장된 위치가 있으면 복원, 없으면 우측 하단 기본. (드래그 이동 유지)
            window::restore_or_position(app.handle());
            Ok(())
        })
        .on_window_event(window::handle_window_event)
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

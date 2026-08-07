// 창 관리: 패널 위치 계산/토글, 포커스 아웃 숨김, 설정·로우데이터 창 생성

use std::sync::atomic::Ordering;
use std::time::Duration;

use tauri::{
    AppHandle, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder, Window,
    WindowEvent,
};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

use crate::AppState;

/// 화면 우측 하단(트레이 인접)에 패널을 배치한다. (UI-02, UI-03)
pub fn position_panel(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = position_panel_window(&win);
    }
}

fn position_panel_window(win: &WebviewWindow) -> tauri::Result<()> {
    // 현재 모니터를 우선 사용하되, 숨김 상태 등으로 얻지 못하면 주 모니터로 대체한다.
    let monitor = match win.current_monitor()? {
        Some(m) => m,
        None => match win.primary_monitor()? {
            Some(m) => m,
            None => return Ok(()),
        },
    };

    let m_pos = monitor.position();
    let m_size = monitor.size();
    let scale = monitor.scale_factor();
    let win_size = win.outer_size()?;

    // 작업표시줄 높이는 모니터 work area API 가 코어에 없어 근사치(48dp)로 띄운다.
    let margin = (8.0 * scale) as i32;
    let taskbar = (48.0 * scale) as i32;

    let x = m_pos.x + m_size.width as i32 - win_size.width as i32 - margin;
    let y = m_pos.y + m_size.height as i32 - win_size.height as i32 - taskbar - margin;

    win.set_position(PhysicalPosition::new(x.max(m_pos.x), y.max(m_pos.y)))?;
    Ok(())
}

/// 트레이 좌클릭/[열기]: 패널을 보이면 숨기고, 숨겨져 있으면 우측 하단에 표시한다. (UI-02)
pub fn toggle_panel(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        if win.is_visible().unwrap_or(false) {
            let _ = win.hide();
        } else {
            let _ = position_panel_window(&win);
            let _ = win.show();
            let _ = win.set_focus();
        }
    }
}

/// [환경설정]: 별도 창으로 표시 (요구사항 결정 D-02)
pub fn open_settings(app: &AppHandle) {
    show_or_create(app, "settings", "TaskTray - 환경설정", 500.0, 780.0);
}

/// [로우데이터 보기]: 별도 창으로 표시 (요구사항 결정 D-02)
pub fn open_rawdata(app: &AppHandle) {
    show_or_create(app, "rawdata", "TaskTray - 로우데이터", 1000.0, 640.0);
}

/// [사용 설명서]: 별도 창으로 표시. 가로를 넓혀 줄바꿈 없이 읽히도록 한다.
pub fn open_help(app: &AppHandle) {
    show_or_create(app, "help", "TaskTray - 사용 설명서", 960.0, 760.0);
}

/// [TaskTray 제거]: 설치 폴더의 uninstall.exe 를 실행하고 앱을 종료한다.
/// 설치본이 아니면(개발 실행/단독 실행) 안내 메시지를 보여준다.
pub fn run_uninstaller(app: &AppHandle) {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            // NSIS 언인스톨러 탐색(기본 uninstall.exe, 혹은 uninstall*.exe)
            let uninstaller = find_uninstaller(dir);
            if let Some(path) = uninstaller {
                if std::process::Command::new(&path).spawn().is_ok() {
                    app.exit(0);
                    return;
                }
            }
        }
    }
    app.dialog()
        .message("설치된 상태에서만 제거할 수 있습니다.\n(개발 실행 또는 단독 실행 파일에서는 제거 기능이 동작하지 않습니다. Windows 설정 → 앱에서 제거하거나 설치본에서 실행해 주세요.)")
        .title("TaskTray 제거")
        .kind(MessageDialogKind::Info)
        .show(|_| {});
}

fn find_uninstaller(dir: &std::path::Path) -> Option<std::path::PathBuf> {
    let default = dir.join("uninstall.exe");
    if default.exists() {
        return Some(default);
    }
    // 파일명이 uninstall 로 시작하는 exe 를 탐색
    let entries = std::fs::read_dir(dir).ok()?;
    for e in entries.flatten() {
        let name = e.file_name();
        let name = name.to_string_lossy().to_lowercase();
        if name.starts_with("uninstall") && name.ends_with(".exe") {
            return Some(e.path());
        }
    }
    None
}

fn show_or_create(app: &AppHandle, label: &str, title: &str, w: f64, h: f64) {
    if let Some(win) = app.get_webview_window(label) {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
        return;
    }
    let _ = WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
        .title(title)
        .inner_size(w, h)
        .min_inner_size(360.0, 360.0)
        .resizable(true)
        .skip_taskbar(false)
        .center()
        .build();
}

/// 창 이벤트 처리.
/// - 패널이 포커스를 잃으면 숨긴다. 단, 앱 자신의 다른 창(설정/로우데이터)이나
///   네이티브 다이얼로그로 포커스가 넘어간 경우는 숨기지 않는다. (UI-02 + 결정 D-03)
/// - 패널 닫기 요청은 종료하지 않고 숨김으로 처리한다. (UI-10)
pub fn handle_window_event(window: &Window, event: &WindowEvent) {
    match event {
        WindowEvent::Focused(false) if window.label() == "main" => {
            let app = window.app_handle().clone();
            // 포커스가 넘어간 대상이 확정될 시간을 잠깐 준 뒤 판정한다.
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(150));

                // 다이얼로그 표시 중(D-03)이거나 압정 고정 상태면 숨기지 않는다.
                let (suppressed, pinned) = app
                    .try_state::<AppState>()
                    .map(|s| {
                        (
                            s.suppress_panel_hide.load(Ordering::SeqCst),
                            s.panel_pinned.load(Ordering::SeqCst),
                        )
                    })
                    .unwrap_or((false, false));
                if suppressed || pinned {
                    return;
                }

                // 앱의 어떤 창이라도 포커스를 가지고 있으면(설정/로우데이터 등) 숨기지 않는다.
                let any_focused = app
                    .webview_windows()
                    .values()
                    .any(|w| w.is_focused().unwrap_or(false));
                if any_focused {
                    return;
                }

                if let Some(panel) = app.get_webview_window("main") {
                    let _ = panel.hide();
                }
            });
        }
        WindowEvent::CloseRequested { api, .. } if window.label() == "main" => {
            // 패널은 닫아도 종료되지 않고 트레이에 상주한다. (UI-10)
            api.prevent_close();
            let _ = window.hide();
        }
        _ => {}
    }
}

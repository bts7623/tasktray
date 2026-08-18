// 창 관리: 패널 위치 계산/토글, 포커스 아웃 숨김, 설정·로우데이터 창 생성

use std::sync::atomic::Ordering;
use std::time::Duration;

use tauri::{
    AppHandle, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder, Window,
    WindowEvent,
};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

use crate::{storage, AppState};

/// 화면 우측 하단(트레이 인접)에 패널을 배치한다. (UI-02, UI-03)
pub fn position_panel(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = position_panel_window(&win);
    }
}

/// 저장된 위치(사용자가 드래그로 옮긴 곳)가 유효하면 복원하고, 없거나 화면 밖이면 기본 위치.
pub fn restore_or_position(app: &AppHandle) {
    let s = storage::load_settings(app);
    if let (Some(x), Some(y)) = (s.window.x, s.window.y) {
        if point_on_any_monitor(app, x, y) {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_position(PhysicalPosition::new(x, y));
                return;
            }
        }
    }
    position_panel(app);
}

/// 좌표(창 좌상단)가 연결된 모니터 중 하나 안에 있는지 검사(사라진 모니터 위치 방지).
fn point_on_any_monitor(app: &AppHandle, x: i32, y: i32) -> bool {
    let Some(win) = app.get_webview_window("main") else {
        return false;
    };
    if let Ok(monitors) = win.available_monitors() {
        for m in monitors {
            let p = m.position();
            let sz = m.size();
            if x >= p.x && x < p.x + sz.width as i32 && y >= p.y && y < p.y + sz.height as i32 {
                return true;
            }
        }
    }
    false
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
            // 재위치하지 않고 마지막 위치(드래그로 옮긴 곳 포함)에서 표시한다.
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

/// [피드백 관리]: 관리자용 별도 창 (D-23).
pub fn open_feedback(app: &AppHandle) {
    show_or_create(app, "feedback", "TaskTray - 피드백 관리", 900.0, 640.0);
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
        WindowEvent::Moved(pos) if window.label() == "main" => {
            // 드래그 이동 종료 후(디바운스) 위치를 저장해 재실행 시 복원한다.
            let app = window.app_handle().clone();
            let (x, y) = (pos.x, pos.y);
            let gen = match app.try_state::<AppState>() {
                Some(state) => state.move_gen.fetch_add(1, Ordering::SeqCst) + 1,
                None => return,
            };
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(600));
                let Some(state) = app.try_state::<AppState>() else {
                    return;
                };
                // 이후 더 최근 이동이 있었으면 이 저장은 건너뛴다(디바운스).
                if state.move_gen.load(Ordering::SeqCst) != gen {
                    return;
                }
                let mut s = storage::load_settings(&app);
                s.window.x = Some(x);
                s.window.y = Some(y);
                let _ = storage::save_settings(&app, &s); // emit 없이 저장
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

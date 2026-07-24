// 시스템 트레이: 아이콘 상주, 좌클릭 패널 토글, 우클릭 컨텍스트 메뉴 (UI-01, UI-02, UI-04)

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle,
};

use crate::window;

pub fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    // 우클릭 컨텍스트 메뉴: [열기] [환경설정] [로우데이터 보기] [종료] (UI-04, 한국어 NFR-06)
    let open_i = MenuItem::with_id(app, "open", "열기", true, None::<&str>)?;
    let settings_i = MenuItem::with_id(app, "settings", "환경설정", true, None::<&str>)?;
    let rawdata_i = MenuItem::with_id(app, "rawdata", "로우데이터 보기", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit_i = MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open_i, &settings_i, &rawdata_i, &sep, &quit_i])?;

    TrayIconBuilder::with_id("tasktray-tray")
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("TaskTray")
        .menu(&menu)
        // 좌클릭은 패널 토글에 쓰므로 좌클릭으로 메뉴가 뜨지 않게 한다.
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => window::toggle_panel(app),
            "settings" => window::open_settings(app),
            "rawdata" => window::open_rawdata(app),
            // 완전 종료는 트레이 [종료] 로만 수행 (UI-10)
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            // 좌클릭(버튼 릴리스) 시 패널 표시/숨김 토글 (UI-02)
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                window::toggle_panel(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

// 단일 인스턴스 (M7, NFR-02).
// 요구사항: 재실행 시 "기존(구버전 포함) 인스턴스를 종료하고 새 인스턴스만 남긴다".
// 방식: 버전과 무관한 고정 loopback 주소를 락 겸 IPC 로 사용.
//   - 시작 시 기존 인스턴스에 연결되면 QUIT 를 보내 종료시킨다.
//   - 포트가 풀리면 우리가 리스너를 확보(=락 획득)하고, 이후 새 인스턴스의 QUIT 를 받으면 종료한다.
// loopback(127.0.0.1) 전용이라 Windows 방화벽 프롬프트가 뜨지 않는다.

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::time::Duration;

use tauri::AppHandle;

// 버전 무관 고정 주소(락 이름 역할). 사설 포트 대역의 고정 값.
const ADDR: &str = "127.0.0.1:52344";
const QUIT: &[u8] = b"QUIT";

/// 기존 인스턴스가 있으면 종료시키고, 우리 인스턴스가 리스너(락)를 확보해 반환한다.
/// 확보 실패(기존이 끝내 안 죽는 등) 시 None.
pub fn take_over() -> Option<TcpListener> {
    // 1) 기존 인스턴스에 종료 신호
    if let Ok(mut s) = TcpStream::connect(ADDR) {
        let _ = s.write_all(QUIT);
        let _ = s.flush();
    }
    // 2) 포트가 풀릴 때까지 재시도하며 우리가 리스너 확보 (최대 ~5초)
    for _ in 0..50 {
        match TcpListener::bind(ADDR) {
            Ok(listener) => return Some(listener),
            Err(_) => std::thread::sleep(Duration::from_millis(100)),
        }
    }
    None
}

/// 리스너에서 QUIT 수신 시 이 인스턴스를 종료하는 백그라운드 스레드를 띄운다.
pub fn serve(app: &AppHandle, listener: TcpListener) {
    let app = app.clone();
    std::thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(mut s) = stream else { continue };
            let mut buf = [0u8; 8];
            match s.read(&mut buf) {
                Ok(n) if n >= 4 && &buf[..4] == QUIT => {
                    app.exit(0);
                    break;
                }
                _ => {}
            }
        }
    });
}

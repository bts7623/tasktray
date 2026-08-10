// 데이터 계층 (M2): settings.json / tasks.json 읽기·쓰기, atomic write + 백업, 손상 폴백
//
// - tasks.json  : 사용자 지정 경로(settings.dataPath)에 저장. atomic write + tasks.backup.json (FR-23)
// - settings.json : %APPDATA%\TaskTray 에 저장. atomic write (백업 없음) (§6.2, 결정 D-07)
// - 모든 시각은 항상 KST(+09:00) 고정 기록 (DR-01, 결정 D-06)
// - tasks.json 파싱 실패 시 백업 로드 시도 후 사용자 알림 (DR-04)

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use chrono::{FixedOffset, Utc};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

/// tasks.json 의 Task 1건. §6.1 스키마를 **문자 그대로** 표현한다. (결정 D-04)
/// 임의 필드 추가 금지. JSON 은 camelCase, null 값은 null 그대로 유지한다.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub title: String,
    pub category: Option<String>,
    pub status: String, // active | done | archived
    pub pinned: bool,
    pub due_date: Option<String>,
    pub created_at: String,
    pub completed_at: Option<String>,
    pub flow_status: Option<String>, // null | "registered" | "excluded"
    pub flow_processed_at: Option<String>,
    pub deleted: bool,
    pub deleted_at: Option<String>,
}

/// tasks.json 파일 전체 구조. (§6.1)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TasksFile {
    pub schema_version: u32,
    pub tasks: Vec<Task>,
}

impl Default for TasksFile {
    fn default() -> Self {
        TasksFile {
            schema_version: CURRENT_SCHEMA_VERSION,
            tasks: Vec::new(),
        }
    }
}

pub const CURRENT_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Theme {
    pub background_color: String,
    pub text_color: String,
    pub font_size: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowSize {
    pub width: u32,
    pub height: u32,
    /// 사용자가 드래그로 옮긴 마지막 위치(물리 좌표). 없으면 우측 하단 기본 위치 사용.
    #[serde(default)]
    pub x: Option<i32>,
    #[serde(default)]
    pub y: Option<i32>,
}

/// settings.json 파일 구조. (§6.2)
/// `data_path` 가 None 이면 최초 실행(저장 폴더 미지정) 상태를 뜻한다.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub data_path: Option<String>,
    pub theme: Theme,
    pub window: WindowSize,
    pub auto_start: bool,
    pub title_auto_parse: bool,
    /// 패널 열기/닫기 글로벌 단축키 (예: "Ctrl+Alt+Space"). 사용자 확장 기능.
    #[serde(default = "default_shortcut")]
    pub shortcut: String,
    /// 패널 항상 위 고정(압정) 여부. 기본 Off(UI-08 확장, opt-in).
    #[serde(default)]
    pub always_on_top: bool,
    /// 패널 불투명도(0.4~1.0). 기본 1.0(불투명). 헤더 슬라이더로 조절.
    #[serde(default = "default_opacity")]
    pub opacity: f64,
    /// 카테고리 대분류별 사용자 지정 색상(대분류 → hex). 없으면 해시 기반 자동 색.
    #[serde(default)]
    pub category_colors: HashMap<String, String>,
}

fn default_shortcut() -> String {
    "Ctrl+Alt+Space".to_string()
}

fn default_opacity() -> f64 {
    1.0
}

impl Default for Settings {
    fn default() -> Self {
        // 기본값: §6.2 예시 및 UI-03(360×720), FR-04(제목 자동분리 기본 Off) 기준
        Settings {
            data_path: None,
            theme: Theme {
                background_color: "#1e1e1e".into(),
                text_color: "#e0e0e0".into(),
                font_size: 14,
            },
            window: WindowSize {
                width: 360,
                height: 720,
                x: None,
                y: None,
            },
            auto_start: false,
            title_auto_parse: false,
            shortcut: default_shortcut(),
            always_on_top: false,
            opacity: default_opacity(),
            category_colors: HashMap::new(),
        }
    }
}

/// tasks 로드 결과. source: primary(정상) | backup(백업 복구) | new(신규). (DR-04)
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TasksLoad {
    pub file: TasksFile,
    pub source: String,
    /// 사용자에게 보여줄 경고 메시지(손상 복구 등). 없으면 null.
    pub message: Option<String>,
}

// ===== 시각 유틸 (DR-01 / D-06) =====

/// 현재 시각을 항상 KST(+09:00) 고정 오프셋의 ISO 8601 문자열로 반환한다.
/// 시스템 타임존과 무관하게 +09:00 로 기록한다. (M3 Task 생성/완료 시각 기록에 사용)
#[allow(dead_code)]
pub fn now_kst() -> String {
    let kst = FixedOffset::east_opt(9 * 3600).expect("valid +09:00 offset");
    Utc::now()
        .with_timezone(&kst)
        .format("%Y-%m-%dT%H:%M:%S+09:00")
        .to_string()
}

// ===== 경로 유틸 =====

/// 앱 기본 디렉터리 %APPDATA%\TaskTray (settings.json 및 기본 데이터 경로). (§6.2, D-05)
pub fn app_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .data_dir()
        .map_err(|e| format!("데이터 디렉터리를 찾을 수 없습니다: {e}"))?;
    Ok(base.join("TaskTray"))
}

pub fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_dir(app)?.join("settings.json"))
}

pub fn tasks_path_in(dir: &str) -> PathBuf {
    Path::new(dir).join("tasks.json")
}

fn tasks_backup_path_in(dir: &str) -> PathBuf {
    Path::new(dir).join("tasks.backup.json")
}

// ===== atomic write =====

/// 임시파일에 기록 후 원본으로 원자적 교체. (FR-23, NFR-07)
/// Windows 의 std::fs::rename 은 대상이 있으면 교체(MoveFileEx REPLACE_EXISTING)한다.
fn atomic_write(path: &Path, contents: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("폴더 생성 실패({}): {e}", parent.display()))?;
    }
    let file_name = path
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "잘못된 파일 경로".to_string())?;
    let tmp = path.with_file_name(format!("{file_name}.tmp"));

    fs::write(&tmp, contents).map_err(|e| format!("임시파일 기록 실패({}): {e}", tmp.display()))?;
    fs::rename(&tmp, path).map_err(|e| {
        // 실패 시 임시파일 정리 시도
        let _ = fs::remove_file(&tmp);
        format!("파일 교체 실패({}): {e}", path.display())
    })?;
    Ok(())
}

// ===== settings.json =====

/// settings.json 로드. 파일이 없으면 기본값(최초 실행 상태)을 반환한다.
pub fn load_settings(app: &AppHandle) -> Settings {
    let path = match settings_path(app) {
        Ok(p) => p,
        Err(_) => return Settings::default(),
    };
    match fs::read_to_string(&path) {
        Ok(s) => serde_json::from_str::<Settings>(&s).unwrap_or_default(),
        Err(_) => Settings::default(), // 파일 없음/읽기 실패 → 최초 실행 취급
    }
}

/// settings.json 저장. atomic write (백업 없음, D-07).
pub fn save_settings(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    let path = settings_path(app)?;
    let json = serde_json::to_vec_pretty(settings).map_err(|e| format!("설정 직렬화 실패: {e}"))?;
    atomic_write(&path, &json)
}

// ===== tasks.json =====

/// 스키마 버전에 따른 마이그레이션. (DR-03) 현재는 v1 만 존재하므로 그대로 반환.
fn migrate(mut file: TasksFile) -> TasksFile {
    // 향후 schemaVersion 상승 시 여기서 단계별 변환을 수행한다.
    if file.schema_version == 0 {
        file.schema_version = CURRENT_SCHEMA_VERSION;
    }
    file
}

/// tasks.json 로드. 파싱 실패 시 tasks.backup.json 폴백 시도. (DR-04)
pub fn load_tasks(dir: &str) -> Result<TasksLoad, String> {
    let path = tasks_path_in(dir);

    // 파일이 아예 없으면 빈 파일로 간주(정상). init_data 에서 생성된다.
    if !path.exists() {
        return Ok(TasksLoad {
            file: TasksFile::default(),
            source: "new".into(),
            message: None,
        });
    }

    match fs::read_to_string(&path).map_err(|e| e.to_string()).and_then(|s| {
        serde_json::from_str::<TasksFile>(&s).map_err(|e| e.to_string())
    }) {
        Ok(file) => Ok(TasksLoad {
            file: migrate(file),
            source: "primary".into(),
            message: None,
        }),
        Err(primary_err) => {
            // 백업 폴백 시도
            let backup = tasks_backup_path_in(dir);
            if backup.exists() {
                if let Ok(s) = fs::read_to_string(&backup) {
                    if let Ok(file) = serde_json::from_str::<TasksFile>(&s) {
                        return Ok(TasksLoad {
                            file: migrate(file),
                            source: "backup".into(),
                            message: Some(
                                "tasks.json 파일이 손상되어 백업(tasks.backup.json)에서 복구했습니다."
                                    .into(),
                            ),
                        });
                    }
                }
            }
            Err(format!(
                "tasks.json 을 읽을 수 없고 백업 복구도 실패했습니다. (원인: {primary_err})"
            ))
        }
    }
}

/// tasks.json 저장. 직전 버전을 tasks.backup.json 으로 백업 후 atomic write. (FR-23)
pub fn save_tasks(dir: &str, file: &TasksFile) -> Result<(), String> {
    let path = tasks_path_in(dir);
    let backup = tasks_backup_path_in(dir);

    let json = serde_json::to_vec_pretty(file).map_err(|e| format!("tasks 직렬화 실패: {e}"))?;

    // 기존 파일이 있으면 백업(직전 버전 1개 유지)
    if path.exists() {
        fs::copy(&path, &backup)
            .map_err(|e| format!("백업 생성 실패({}): {e}", backup.display()))?;
    }

    atomic_write(&path, &json)
}

/// 저장 폴더를 확정하고 tasks.json 이 없으면 빈 파일을 생성한다. (FR-20, FR-22)
/// 이미 tasks.json 이 있으면 그대로 둔다(타 PC 파일 가져오기 시나리오).
pub fn ensure_data_dir(dir: &str) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| format!("데이터 폴더 생성 실패({dir}): {e}"))?;
    let path = tasks_path_in(dir);
    if !path.exists() {
        let empty = TasksFile::default();
        let json = serde_json::to_vec_pretty(&empty).map_err(|e| e.to_string())?;
        atomic_write(&path, &json)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir(tag: &str) -> String {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("tasktray_test_{tag}_{nanos}"));
        fs::create_dir_all(&dir).unwrap();
        dir.to_string_lossy().to_string()
    }

    fn sample_task(id: &str) -> Task {
        Task {
            id: id.into(),
            title: "과업내용서 초안 작성".into(),
            category: Some("통합정보망_태양광".into()),
            status: "active".into(),
            pinned: false,
            due_date: None,
            created_at: now_kst(),
            completed_at: None,
            flow_status: None,
            flow_processed_at: None,
            deleted: false,
            deleted_at: None,
        }
    }

    #[test]
    fn now_kst_has_fixed_offset() {
        assert!(now_kst().ends_with("+09:00"), "KST 오프셋 고정 (DR-01/D-06)");
    }

    #[test]
    fn save_then_load_roundtrip() {
        let dir = temp_dir("roundtrip");
        let file = TasksFile {
            schema_version: CURRENT_SCHEMA_VERSION,
            tasks: vec![sample_task("a")],
        };
        save_tasks(&dir, &file).unwrap();

        let loaded = load_tasks(&dir).unwrap();
        assert_eq!(loaded.source, "primary");
        assert_eq!(loaded.file.tasks.len(), 1);
        assert_eq!(loaded.file.tasks[0].id, "a");
        assert_eq!(loaded.file.tasks[0].category.as_deref(), Some("통합정보망_태양광"));
    }

    #[test]
    fn second_save_creates_backup() {
        // FR-23: 저장 시 직전 버전 1개를 tasks.backup.json 으로 백업
        let dir = temp_dir("backup");
        let v1 = TasksFile {
            schema_version: 1,
            tasks: vec![sample_task("v1")],
        };
        save_tasks(&dir, &v1).unwrap();
        assert!(!tasks_backup_path_in(&dir).exists(), "첫 저장엔 백업 없음");

        let v2 = TasksFile {
            schema_version: 1,
            tasks: vec![sample_task("v2")],
        };
        save_tasks(&dir, &v2).unwrap();
        assert!(tasks_backup_path_in(&dir).exists(), "두 번째 저장에 백업 생성");

        // 백업엔 직전(v1) 내용이 들어있어야 한다
        let backup_str = fs::read_to_string(tasks_backup_path_in(&dir)).unwrap();
        let backup: TasksFile = serde_json::from_str(&backup_str).unwrap();
        assert_eq!(backup.tasks[0].id, "v1");
    }

    #[test]
    fn corrupt_primary_falls_back_to_backup() {
        // DR-04: tasks.json 손상 시 백업에서 복구하고 알림 메시지 반환
        let dir = temp_dir("corrupt");
        let good = TasksFile {
            schema_version: 1,
            tasks: vec![sample_task("good")],
        };
        // 백업에 정상본을 넣고, 기본 파일은 깨뜨린다
        fs::write(tasks_backup_path_in(&dir), serde_json::to_vec(&good).unwrap()).unwrap();
        fs::write(tasks_path_in(&dir), b"{ this is not valid json ").unwrap();

        let loaded = load_tasks(&dir).unwrap();
        assert_eq!(loaded.source, "backup");
        assert!(loaded.message.is_some(), "복구 알림 메시지 존재");
        assert_eq!(loaded.file.tasks[0].id, "good");
    }

    #[test]
    fn missing_file_is_new_not_error() {
        let dir = temp_dir("missing");
        let loaded = load_tasks(&dir).unwrap();
        assert_eq!(loaded.source, "new");
        assert_eq!(loaded.file.tasks.len(), 0);
    }
}

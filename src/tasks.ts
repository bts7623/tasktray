// Task 순수 로직 (M3). UI/IO 없음 — 단위 테스트 대상.

import type { Task } from "./api";

/** 현재 시각을 항상 KST(+09:00) 고정으로 ISO 8601 문자열 반환. (DR-01 / D-06)
 *  시스템 타임존과 무관하게 +09:00 벽시계 값으로 기록한다. */
export function nowKst(): string {
  const d = new Date(Date.now() + 9 * 3600 * 1000); // UTC 필드를 KST 벽시계로 이동
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}+09:00`
  );
}

/** 오늘 날짜(KST) 를 YYYY-MM-DD 로 반환. (종료예정일 비교용) */
export function todayKst(): string {
  return nowKst().slice(0, 10);
}

/** UUID v4 생성. 웹뷰의 crypto.randomUUID 사용. */
export function newId(): string {
  return crypto.randomUUID();
}

/** 카테고리 계층 파싱. 첫 `_` 앞=대분류, 뒤=소분류. 구분자 없으면 소분류 없음. (FR-03) */
export function parseCategory(category: string | null): {
  major: string;
  minor: string | null;
} {
  if (!category) return { major: "", minor: null };
  const i = category.indexOf("_");
  if (i < 0) return { major: category, minor: null };
  return { major: category.slice(0, i), minor: category.slice(i + 1) };
}

/** 행에 축약 표시할 카테고리 라벨(소분류 우선, 없으면 대분류). (UI-06) */
export function categoryShort(category: string | null): string {
  const { major, minor } = parseCategory(category);
  return minor ?? major;
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** 배경색(hex) 위에서 읽기 좋은 글자색(어두운/밝은)을 고른다. */
export function readableText(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length < 6) return "#202020";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = 0.299 * r + 0.587 * g + 0.114 * b; // 0~255
  return lum > 150 ? "#20242b" : "#f3f4f6";
}

/** 대분류 문자열 → 해시 기반 기본 색(hex, 파스텔). */
export function defaultCategoryHex(major: string): string {
  let hash = 0;
  for (let i = 0; i < major.length; i++) {
    hash = (hash * 31 + major.charCodeAt(i)) % 360;
  }
  const hue = ((hash % 360) + 360) % 360;
  return hslToHex(hue, 0.7, 0.85);
}

/** 카테고리 칩 색상. 대분류별 사용자 지정색(overrides) 우선, 없으면 해시 기본색. (사용자 요청)
 *  같은 대분류=같은 색. bg(hex)+대비 글자색+major 반환. */
export function categoryColor(
  category: string | null,
  overrides?: Record<string, string>,
): { bg: string; fg: string; major: string } | null {
  const { major } = parseCategory(category);
  const key = major.trim();
  if (key === "") return null;
  const bg = overrides?.[key] ?? defaultCategoryHex(key);
  return { bg, fg: readableText(bg), major: key };
}

/** YYYY-MM-DD → 한글 요일 1글자(일~토). 타임존 영향 없이 계산. */
export function weekdayKo(dateStr: string | null): string {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return "";
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return ["일", "월", "화", "수", "목", "금", "토"][wd] ?? "";
}

/** 제목 자동분리(FR-04). On일 때 마지막 `_` 뒤=제목, 앞=카테고리.
 *  자동분리 결과가 있으면 그 카테고리를 우선(입력란 카테고리는 무시, D-09). */
export function resolveTitleCategory(
  rawTitle: string,
  rawCategory: string | null,
  titleAutoParse: boolean,
): { title: string; category: string | null } {
  const title0 = rawTitle.trim();
  const cat0 = rawCategory && rawCategory.trim() !== "" ? rawCategory.trim() : null;

  if (titleAutoParse) {
    const i = title0.lastIndexOf("_");
    if (i > 0 && i < title0.length - 1) {
      // 자동분리 성공 → 카테고리 우선 (D-09)
      return { title: title0.slice(i + 1).trim(), category: title0.slice(0, i).trim() };
    }
  }
  return { title: title0, category: cat0 };
}

/** tasks.json 에서 사용된 카테고리 값(중복 제거)을 자동완성 목록으로 수집. (FR-02, DR-05) */
export function collectCategories(tasks: Task[]): string[] {
  const set = new Set<string>();
  for (const t of tasks) {
    if (t.category && t.category.trim() !== "") set.add(t.category);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
}

/** 종료예정일 초과 여부(오늘보다 과거). (FR-07) */
export function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  return dueDate < todayKst();
}

// ===== 영역별 필터 + 정렬 =====

const notDeleted = (t: Task) => !t.deleted;

/** 대분류(첫 _ 앞). 카테고리 없으면 빈 문자열. */
const majorOf = (t: Task) => (t.category ? parseCategory(t.category).major : "");

/** 정렬 비교: 카테고리 1depth(대분류) 가나다 → task명 가나다. (사용자 요청)
 *  소분류는 1차 정렬에 영향을 주지 않는다(대분류 안에서는 제목 순). */
function byCategoryThenTitle(a: Task, b: Task): number {
  const c = majorOf(a).localeCompare(majorOf(b), "ko");
  if (c !== 0) return c;
  return a.title.localeCompare(b.title, "ko");
}

/** 오늘 할 일(Pin): pinned && active. 대분류 가나다 → 제목 가나다. (D-10, D-11) */
export function pinnedTasks(tasks: Task[]): Task[] {
  return tasks
    .filter((t) => notDeleted(t) && t.status === "active" && t.pinned)
    .sort(byCategoryThenTitle);
}

/** 진행 중(active, 비Pin): 대분류 가나다 → 제목 가나다. (FR-12 변경) */
export function activeTasks(tasks: Task[]): Task[] {
  return tasks
    .filter((t) => notDeleted(t) && t.status === "active" && !t.pinned)
    .sort(byCategoryThenTitle);
}

/** flow 등록 대기(done): 완료일 최신순. (FR-12) */
export function doneTasks(tasks: Task[]): Task[] {
  return tasks
    .filter((t) => notDeleted(t) && t.status === "done")
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
}

// ===== 불변 업데이트 헬퍼 (반환값을 저장) =====

/** 새 Task 생성(active). createdAt=KST. */
export function createTask(title: string, category: string | null, dueDate: string | null): Task {
  return {
    id: newId(),
    title,
    category,
    status: "active",
    pinned: false,
    dueDate: dueDate && dueDate !== "" ? dueDate : null,
    createdAt: nowKst(),
    completedAt: null,
    flowStatus: null,
    flowProcessedAt: null,
    deleted: false,
    deletedAt: null,
  };
}

export function replaceTask(tasks: Task[], updated: Task): Task[] {
  return tasks.map((t) => (t.id === updated.id ? updated : t));
}

/** flow 처리: done → archived. flowStatus 기록, flowProcessedAt=KST. (FR-10, §3.2) */
export function archiveTask(task: Task, flow: "registered" | "excluded"): Task {
  return {
    ...task,
    status: "archived",
    flowStatus: flow,
    flowProcessedAt: nowKst(),
  };
}

/** 종료 취소: archived → done. flow 기록 초기화. (FR-11, §3.2) */
export function restoreToDone(task: Task): Task {
  return {
    ...task,
    status: "done",
    flowStatus: null,
    flowProcessedAt: null,
  };
}

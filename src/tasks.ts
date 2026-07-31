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

/** 카테고리 포함 문자열 기준 가나다(ko) 비교 키. */
const koKey = (t: Task) => `${t.category ?? ""} ${t.title}`;

/** 오늘 할 일(Pin): pinned && active. 카테고리 포함 가나다순. (D-10, D-11) */
export function pinnedTasks(tasks: Task[]): Task[] {
  return tasks
    .filter((t) => notDeleted(t) && t.status === "active" && t.pinned)
    .sort((a, b) => koKey(a).localeCompare(koKey(b), "ko"));
}

/** 진행 중(active, 비Pin): 등록일 최신순. (FR-12) */
export function activeTasks(tasks: Task[]): Task[] {
  return tasks
    .filter((t) => notDeleted(t) && t.status === "active" && !t.pinned)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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

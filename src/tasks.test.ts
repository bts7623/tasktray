import { describe, it, expect } from "vitest";
import type { Task } from "./api";
import {
  activeTasks,
  archiveTask,
  categoryShort,
  collectCategories,
  doneTasks,
  isOverdue,
  nowKst,
  parseCategory,
  pinnedTasks,
  resolveTitleCategory,
  restoreToDone,
  todayKst,
} from "./tasks";

function mk(p: Partial<Task>): Task {
  return {
    id: p.id ?? Math.random().toString(36).slice(2),
    title: p.title ?? "제목",
    category: p.category ?? null,
    status: p.status ?? "active",
    pinned: p.pinned ?? false,
    dueDate: p.dueDate ?? null,
    createdAt: p.createdAt ?? "2026-07-01T09:00:00+09:00",
    completedAt: p.completedAt ?? null,
    flowStatus: p.flowStatus ?? null,
    flowProcessedAt: p.flowProcessedAt ?? null,
    deleted: p.deleted ?? false,
    deletedAt: p.deletedAt ?? null,
  };
}

describe("nowKst / todayKst", () => {
  it("항상 +09:00 오프셋 (DR-01/D-06)", () => {
    expect(nowKst()).toMatch(/\+09:00$/);
    expect(todayKst()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("parseCategory (FR-03)", () => {
  it("첫 _ 앞=대분류, 뒤=소분류", () => {
    expect(parseCategory("통합정보망_태양광")).toEqual({ major: "통합정보망", minor: "태양광" });
  });
  it("구분자 없으면 소분류 null", () => {
    expect(parseCategory("기관정보화")).toEqual({ major: "기관정보화", minor: null });
  });
  it("여러 _ 는 첫 번째만 분리", () => {
    expect(parseCategory("A_B_C")).toEqual({ major: "A", minor: "B_C" });
  });
  it("null 처리", () => {
    expect(parseCategory(null)).toEqual({ major: "", minor: null });
  });
});

describe("categoryShort (UI-06)", () => {
  it("소분류 우선", () => expect(categoryShort("통합정보망_태양광")).toBe("태양광"));
  it("소분류 없으면 대분류", () => expect(categoryShort("기관정보화")).toBe("기관정보화"));
});

describe("resolveTitleCategory (FR-04 / D-09)", () => {
  it("자동분리 Off: 제목 그대로, 입력 카테고리 사용", () => {
    expect(resolveTitleCategory("통합정보망_태양광_과업검토", "직접입력", false)).toEqual({
      title: "통합정보망_태양광_과업검토",
      category: "직접입력",
    });
  });
  it("자동분리 On: 마지막 _ 뒤=제목, 앞=카테고리(입력 카테고리 무시, D-09)", () => {
    expect(resolveTitleCategory("통합정보망_태양광_과업검토", "직접입력", true)).toEqual({
      title: "과업검토",
      category: "통합정보망_태양광",
    });
  });
  it("자동분리 On 이나 _ 없으면 제목 그대로 + 입력 카테고리", () => {
    expect(resolveTitleCategory("과업검토", "카테고리A", true)).toEqual({
      title: "과업검토",
      category: "카테고리A",
    });
  });
  it("빈 카테고리는 null", () => {
    expect(resolveTitleCategory("제목", "  ", false).category).toBeNull();
  });
});

describe("collectCategories (FR-02/DR-05)", () => {
  it("중복 제거 + 가나다 정렬", () => {
    const tasks = [
      mk({ category: "통합정보망_태양광" }),
      mk({ category: "기관정보화_그룹웨어" }),
      mk({ category: "통합정보망_태양광" }),
      mk({ category: null }),
    ];
    expect(collectCategories(tasks)).toEqual(["기관정보화_그룹웨어", "통합정보망_태양광"]);
  });
});

describe("isOverdue (FR-07)", () => {
  it("과거 날짜는 초과", () => expect(isOverdue("2000-01-01")).toBe(true));
  it("미래 날짜는 아님", () => expect(isOverdue("2999-01-01")).toBe(false));
  it("null 은 아님", () => expect(isOverdue(null)).toBe(false));
});

describe("영역 필터/정렬 (FR-12/D-10/D-11)", () => {
  const tasks = [
    // Pin: 대분류(통합정보망/기관정보화) → 제목 순. 소분류는 순서에 영향 없음
    mk({ id: "p1", title: "가", category: "통합정보망_태양광", status: "active", pinned: true }),
    mk({ id: "p2", title: "나", category: "통합정보망_감자", status: "active", pinned: true }),
    mk({ id: "p3", title: "다", category: "기관정보화_그룹웨어", status: "active", pinned: true }),
    // active: 대분류 → 제목 순
    mk({ id: "a1", title: "다", category: "나_x", status: "active", pinned: false }),
    mk({ id: "a2", title: "가", category: "가_y", status: "active", pinned: false }),
    mk({ id: "d1", status: "done", completedAt: "2026-07-02T09:00:00+09:00" }),
    mk({ id: "d2", status: "done", completedAt: "2026-07-06T09:00:00+09:00" }),
    mk({ id: "x", status: "active", pinned: true, deleted: true }),
  ];

  it("Pin: 대분류 가나다 → 제목 가나다(소분류 무시), 삭제 제외 (D-11 변경)", () => {
    // 기관정보화 먼저, 그다음 통합정보망 내에서 제목 가(p1) < 나(p2)
    expect(pinnedTasks(tasks).map((t) => t.id)).toEqual(["p3", "p1", "p2"]);
  });
  it("active: 대분류 가나다 → 제목 가나다 (FR-12 변경)", () => {
    expect(activeTasks(tasks).map((t) => t.id)).toEqual(["a2", "a1"]);
  });
  it("done: 완료일 최신순 (변경 없음)", () => {
    expect(doneTasks(tasks).map((t) => t.id)).toEqual(["d2", "d1"]);
  });
});

describe("flow 처리 (FR-10/11, §3.2)", () => {
  const done = mk({ id: "d", status: "done", completedAt: "2026-07-02T09:00:00+09:00" });

  it("archiveTask: done→archived, flowStatus/flowProcessedAt 기록", () => {
    const a = archiveTask(done, "registered");
    expect(a.status).toBe("archived");
    expect(a.flowStatus).toBe("registered");
    expect(a.flowProcessedAt).toMatch(/\+09:00$/);
    expect(a.completedAt).toBe(done.completedAt); // 완료일은 보존
  });

  it("archiveTask 제외", () => {
    expect(archiveTask(done, "excluded").flowStatus).toBe("excluded");
  });

  it("restoreToDone: archived→done, flow 기록 초기화", () => {
    const a = archiveTask(done, "registered");
    const r = restoreToDone(a);
    expect(r.status).toBe("done");
    expect(r.flowStatus).toBeNull();
    expect(r.flowProcessedAt).toBeNull();
    expect(r.completedAt).toBe(done.completedAt); // 완료일은 그대로
  });

  it("archived 는 어느 패널 영역에도 안 나옴", () => {
    const list = [archiveTask(done, "registered")];
    expect(pinnedTasks(list)).toHaveLength(0);
    expect(activeTasks(list)).toHaveLength(0);
    expect(doneTasks(list)).toHaveLength(0);
  });
});

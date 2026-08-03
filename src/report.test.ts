import { describe, it, expect } from "vitest";
import type { Task } from "./api";
import {
  buildCsv,
  buildMarkdown,
  disposition,
  groupByCategory,
  periodLabel,
  selectForReport,
} from "./report";

function mk(p: Partial<Task>): Task {
  return {
    id: p.id ?? Math.random().toString(36).slice(2),
    title: p.title ?? "제목",
    category: p.category ?? null,
    status: p.status ?? "archived",
    pinned: p.pinned ?? false,
    dueDate: p.dueDate ?? null,
    createdAt: p.createdAt ?? "2026-03-05T09:00:00+09:00",
    completedAt: p.completedAt ?? "2026-03-12T09:00:00+09:00",
    flowStatus: p.flowStatus ?? "registered",
    flowProcessedAt: p.flowProcessedAt ?? "2026-03-13T09:00:00+09:00",
    deleted: p.deleted ?? false,
    deletedAt: p.deletedAt ?? null,
  };
}

describe("disposition (D-13)", () => {
  it("registered/excluded/pending/deleted/active", () => {
    expect(disposition(mk({ status: "archived", flowStatus: "registered" }))).toBe("registered");
    expect(disposition(mk({ status: "archived", flowStatus: "excluded" }))).toBe("excluded");
    expect(disposition(mk({ status: "done", flowStatus: null }))).toBe("pending");
    expect(disposition(mk({ deleted: true }))).toBeNull();
    expect(disposition(mk({ status: "active", flowStatus: null }))).toBeNull();
  });
});

describe("selectForReport 범위/기간 (FR-17)", () => {
  const tasks = [
    mk({ id: "r", flowStatus: "registered", completedAt: "2026-03-12T09:00:00+09:00" }),
    mk({ id: "e", flowStatus: "excluded", completedAt: "2026-03-15T09:00:00+09:00" }),
    mk({ id: "p", status: "done", flowStatus: null, completedAt: "2026-03-20T09:00:00+09:00" }),
    mk({ id: "del", flowStatus: "registered", deleted: true }),
  ];

  it("registeredOnly: 등록완료만, 삭제 제외", () => {
    const s = selectForReport(tasks, "registeredOnly", "", "");
    expect(s.registered.map((t) => t.id)).toEqual(["r"]);
    expect(s.excluded).toHaveLength(0);
    expect(s.pending).toHaveLength(0);
  });

  it("withExcluded: 등록완료 + 제외", () => {
    const s = selectForReport(tasks, "withExcluded", "", "");
    expect(s.registered).toHaveLength(1);
    expect(s.excluded).toHaveLength(1);
    expect(s.pending).toHaveLength(0);
  });

  it("allCompleted: done(미처리)까지 포함", () => {
    const s = selectForReport(tasks, "allCompleted", "", "");
    expect(s.pending.map((t) => t.id)).toEqual(["p"]);
  });

  it("기간 필터(완료일 기준)", () => {
    const s = selectForReport(tasks, "allCompleted", "2026-03-14", "2026-03-18");
    expect(s.registered).toHaveLength(0); // 03-12 제외
    expect(s.excluded).toHaveLength(1); // 03-15 포함
    expect(s.pending).toHaveLength(0); // 03-20 제외
  });
});

describe("groupByCategory (FR-18)", () => {
  it("미분류는 마지막, 대분류 가나다순", () => {
    const g = groupByCategory([
      mk({ category: "통합정보망_태양광" }),
      mk({ category: null }),
      mk({ category: "기관정보화_그룹웨어" }),
    ]);
    expect(g.map((x) => x.major)).toEqual(["기관정보화", "통합정보망", "미분류"]);
  });

  it("1뎁스는 소분류 없이(minor=null), 2뎁스는 소분류 분리", () => {
    const g = groupByCategory([mk({ category: "기관정보화" }), mk({ category: "기관정보화_그룹웨어" })]);
    expect(g).toHaveLength(1);
    expect(g[0].count).toBe(2);
    const minors = g[0].minors.map((m) => m.minor);
    expect(minors).toContain(null);
    expect(minors).toContain("그룹웨어");
  });
});

describe("buildMarkdown (FR-18/19, D-13)", () => {
  const tasks = [
    mk({ title: "과업내용서", category: "통합정보망_태양광", flowStatus: "registered", completedAt: "2026-03-12T09:00:00+09:00", createdAt: "2026-03-05T09:00:00+09:00" }),
    mk({ title: "반려건", category: "기관정보화", flowStatus: "excluded", completedAt: "2026-03-15T09:00:00+09:00" }),
    mk({ title: "대기건", status: "done", flowStatus: null, completedAt: "2026-03-20T09:00:00+09:00" }),
  ];

  it("총계는 등록완료 기준", () => {
    const m = buildMarkdown(tasks, "registeredOnly", "", "");
    expect(m).toContain("flow 등록 기준, 총 1건");
    expect(m).toContain("## 통합정보망 (1건)");
    expect(m).toContain("### 태양광 (1건)");
    expect(m).toContain("- 03-12 | 과업내용서 (등록 03-05)");
    expect(m).not.toContain("제외 (모니터링");
  });

  it("withExcluded: 제외 섹션 추가(총계 불포함)", () => {
    const m = buildMarkdown(tasks, "withExcluded", "", "");
    expect(m).toContain("총 1건"); // 여전히 등록완료 1건
    expect(m).toContain("# 제외 (모니터링, 총 1건)");
    expect(m).not.toContain("flow 미처리");
  });

  it("allCompleted: 미처리 섹션까지", () => {
    const m = buildMarkdown(tasks, "allCompleted", "", "");
    expect(m).toContain("# flow 미처리 (모니터링, 총 1건)");
  });
});

describe("buildCsv (FR-19)", () => {
  it("헤더 + BOM + 구분 열", () => {
    const csv = buildCsv([mk({ title: "과업내용서", category: "통합정보망_태양광" })], "registeredOnly", "", "");
    expect(csv.charCodeAt(0)).toBe(0xfeff); // BOM
    expect(csv).toContain("완료일,구분,대분류,소분류,제목,카테고리,등록일");
    expect(csv).toContain("2026-03-12,등록완료,통합정보망,태양광,과업내용서,통합정보망_태양광,2026-03-05");
  });

  it("쉼표 포함 제목은 따옴표 이스케이프", () => {
    const csv = buildCsv([mk({ title: "A, B" })], "registeredOnly", "", "");
    expect(csv).toContain('"A, B"');
  });
});

describe("periodLabel", () => {
  it("범위 표기", () => {
    expect(periodLabel("2026-01-01", "2026-12-31")).toBe("2026-01-01 ~ 2026-12-31");
    expect(periodLabel("", "")).toBe("전체 기간");
  });
});

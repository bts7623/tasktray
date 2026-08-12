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
    updatedAt: p.updatedAt ?? "2026-03-13T09:00:00+09:00",
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

describe("selectForReport 기간/구분 (FR-17, D-13 개정)", () => {
  const tasks = [
    mk({ id: "r", flowStatus: "registered", completedAt: "2026-03-12T09:00:00+09:00" }),
    mk({ id: "e", flowStatus: "excluded", completedAt: "2026-03-15T09:00:00+09:00" }),
    mk({ id: "p", status: "done", flowStatus: null, completedAt: "2026-03-20T09:00:00+09:00" }),
    mk({ id: "del", flowStatus: "registered", deleted: true }),
  ];

  it("범위 구분 없이 registered/excluded/pending 모두 담고 삭제 제외", () => {
    const s = selectForReport(tasks, "", "");
    expect(s.registered.map((t) => t.id)).toEqual(["r"]);
    expect(s.excluded.map((t) => t.id)).toEqual(["e"]);
    expect(s.pending.map((t) => t.id)).toEqual(["p"]);
  });

  it("기간 필터(완료일 기준)", () => {
    const s = selectForReport(tasks, "2026-03-14", "2026-03-18");
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

  it("총계는 등록완료 기준, 카테고리 계층·항목 표기", () => {
    const m = buildMarkdown(tasks, "", "");
    expect(m).toContain("flow 등록 기준, 총 1건");
    expect(m).toContain("## 통합정보망 (1건)");
    expect(m).toContain("### 태양광 (1건)");
    expect(m).toContain("- 03-12 | 과업내용서 (등록 03-05)");
  });

  it("제외·미처리는 대상 범위와 무관하게 항상 하단 별도 섹션", () => {
    const m = buildMarkdown(tasks, "", "");
    expect(m).toContain("총 1건"); // 등록완료 1건이 KPI 총계
    expect(m).toContain("# 제외 (모니터링, 총 1건)");
    expect(m).toContain("# flow 미처리 (모니터링, 총 1건)");
    // 제외·미처리 섹션이 등록완료 본문보다 아래(하단)에 온다
    expect(m.indexOf("# 제외 (모니터링")).toBeGreaterThan(m.indexOf("## 통합정보망"));
    expect(m.indexOf("# flow 미처리")).toBeGreaterThan(m.indexOf("# 제외 (모니터링"));
  });

  it("해당 구분이 없으면 그 섹션은 생략", () => {
    const onlyReg = [mk({ title: "A", flowStatus: "registered" })];
    const m = buildMarkdown(onlyReg, "", "");
    expect(m).not.toContain("제외 (모니터링");
    expect(m).not.toContain("flow 미처리");
  });
});

describe("buildCsv (FR-19)", () => {
  it("헤더 + BOM + 구분 열", () => {
    const csv = buildCsv([mk({ title: "과업내용서", category: "통합정보망_태양광" })], "", "");
    expect(csv.charCodeAt(0)).toBe(0xfeff); // BOM
    expect(csv).toContain("완료일,구분,대분류,소분류,제목,카테고리,등록일");
    expect(csv).toContain("2026-03-12,등록완료,통합정보망,태양광,과업내용서,통합정보망_태양광,2026-03-05");
  });

  it("쉼표 포함 제목은 따옴표 이스케이프", () => {
    const csv = buildCsv([mk({ title: "A, B" })], "", "");
    expect(csv).toContain('"A, B"');
  });

  it("구분 열로 구분되고 제외·미처리가 등록완료보다 아래쪽 정렬", () => {
    const csv = buildCsv(
      [
        mk({ id: "r", title: "등록건", flowStatus: "registered" }),
        mk({ id: "e", title: "제외건", flowStatus: "excluded" }),
        mk({ id: "p", title: "미처리건", status: "done", flowStatus: null }),
      ],
      "",
      "",
    );
    expect(csv).toContain(",등록완료,");
    expect(csv).toContain(",제외,");
    expect(csv).toContain(",미처리,");
    // 행 순서: 등록완료 < 제외 < 미처리
    expect(csv.indexOf("등록건")).toBeLessThan(csv.indexOf("제외건"));
    expect(csv.indexOf("제외건")).toBeLessThan(csv.indexOf("미처리건"));
  });
});

describe("periodLabel", () => {
  it("범위 표기", () => {
    expect(periodLabel("2026-01-01", "2026-12-31")).toBe("2026-01-01 ~ 2026-12-31");
    expect(periodLabel("", "")).toBe("전체 기간");
  });
});

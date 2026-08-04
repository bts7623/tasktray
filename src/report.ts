// 실적 리포트 생성 (M5, FR-17~19). 순수 로직 — 단위 테스트 대상.
// D-13(개정): KPI 총계=등록완료(registered). 제외(excluded)/미처리(done)는 대상 범위와 무관하게
//   항상 하단 별도 모니터링 섹션(MD)·구분 열(CSV)로 표기하며 총계에는 포함하지 않는다.
//   삭제(deleted)는 리포트에서 완전 제외. 기간은 완료일(completedAt) 기준.

import type { Task } from "./api";
import { parseCategory } from "./tasks";

export type Disposition = "registered" | "excluded" | "pending";

const MISC = "미분류";

/** 리포트상 구분. deleted 및 완료이력 없는 것은 null(제외). */
export function disposition(t: Task): Disposition | null {
  if (t.deleted) return null;
  if (t.status === "archived" && t.flowStatus === "registered") return "registered";
  if (t.status === "archived" && t.flowStatus === "excluded") return "excluded";
  if (t.status === "done") return "pending";
  return null;
}

export const dispositionLabel: Record<Disposition, string> = {
  registered: "등록완료",
  excluded: "제외",
  pending: "미처리",
};

function inPeriod(dateIso: string | null, start: string, end: string): boolean {
  if (!dateIso) return false;
  const d = dateIso.slice(0, 10); // YYYY-MM-DD
  if (start && d < start) return false;
  if (end && d > end) return false;
  return true;
}

/** 기간으로 걸러 구분별 Task 목록을 반환. 삭제는 제외, 각 목록은 완료일 오름차순. (FR-18)
 *  대상 범위 구분 없이 registered/excluded/pending 을 모두 담는다(표기 위치는 생성 단계에서 분리). */
export function selectForReport(
  tasks: Task[],
  start: string,
  end: string,
): Record<Disposition, Task[]> {
  const out: Record<Disposition, Task[]> = { registered: [], excluded: [], pending: [] };
  for (const t of tasks) {
    const d = disposition(t);
    if (!d) continue;
    if (!inPeriod(t.completedAt, start, end)) continue;
    out[d].push(t);
  }
  for (const key of Object.keys(out) as Disposition[]) {
    out[key].sort((a, b) => (a.completedAt ?? "").localeCompare(b.completedAt ?? ""));
  }
  return out;
}

// ===== 카테고리 계층 그룹핑 (FR-18) =====

interface MinorGroup {
  minor: string | null;
  tasks: Task[];
}
interface MajorGroup {
  major: string;
  count: number;
  minors: MinorGroup[]; // minor=null 은 소분류 없는(1뎁스) 항목
}

/** 대분류→소분류 계층으로 그룹핑. 미분류는 마지막, 그 외 가나다순. */
export function groupByCategory(tasks: Task[]): MajorGroup[] {
  const majors = new Map<string, Map<string | null, Task[]>>();
  for (const t of tasks) {
    const { major, minor } = t.category
      ? parseCategory(t.category)
      : { major: MISC, minor: null };
    const key = major === "" ? MISC : major;
    if (!majors.has(key)) majors.set(key, new Map());
    const minors = majors.get(key)!;
    const mk = minor ?? null;
    if (!minors.has(mk)) minors.set(mk, []);
    minors.get(mk)!.push(t);
  }

  const majorKeys = Array.from(majors.keys()).sort((a, b) => {
    if (a === MISC) return 1;
    if (b === MISC) return -1;
    return a.localeCompare(b, "ko");
  });

  return majorKeys.map((major) => {
    const minorsMap = majors.get(major)!;
    const minorKeys = Array.from(minorsMap.keys()).sort((a, b) => {
      if (a === null) return -1; // 소분류 없는 항목 먼저
      if (b === null) return 1;
      return a.localeCompare(b, "ko");
    });
    const minors = minorKeys.map((minor) => ({ minor, tasks: minorsMap.get(minor)! }));
    const count = minors.reduce((s, m) => s + m.tasks.length, 0);
    return { major, count, minors };
  });
}

function md(dateFull: string | null): string {
  return dateFull ? dateFull.slice(5, 10) : "--";
}

export function periodLabel(start: string, end: string): string {
  if (start && end) return `${start} ~ ${end}`;
  if (start) return `${start} ~`;
  if (end) return `~ ${end}`;
  return "전체 기간";
}

/** 한 구분(disposition)의 그룹들을 Markdown 본문으로. headingLevel: 대분류(##)/소분류(###) */
function groupsToMarkdown(groups: MajorGroup[]): string {
  const lines: string[] = [];
  for (const g of groups) {
    lines.push(`## ${g.major} (${g.count}건)`);
    for (const m of g.minors) {
      const items = m.tasks
        .map((t) => `- ${md(t.completedAt)} | ${t.title} (등록 ${md(t.createdAt)})`)
        .join("\n");
      if (m.minor === null) {
        lines.push(items); // 1뎁스: 대분류 아래 직접
      } else {
        lines.push(`### ${m.minor} (${m.tasks.length}건)`);
        lines.push(items);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

/** 실적 리포트 Markdown 생성. 제외·미처리는 항상 하단 별도 섹션. (FR-18/19, D-13 개정) */
export function buildMarkdown(tasks: Task[], start: string, end: string): string {
  const sel = selectForReport(tasks, start, end);
  const label = periodLabel(start, end);

  const out: string[] = [];
  // KPI 총계 = 등록완료 (D-13)
  out.push(`# ${label} 업무 실적 (flow 등록 기준, 총 ${sel.registered.length}건)`);
  out.push("");
  out.push(groupsToMarkdown(groupByCategory(sel.registered)) || "(해당 없음)");

  // 제외(모니터링) — 총계 불포함, 하단 별도 섹션. 항상 표기.
  if (sel.excluded.length > 0) {
    out.push("---");
    out.push(`# 제외 (모니터링, 총 ${sel.excluded.length}건)`);
    out.push("");
    out.push(groupsToMarkdown(groupByCategory(sel.excluded)));
  }
  // 미처리(모니터링) — 총계 불포함, 하단 별도 섹션. 항상 표기.
  if (sel.pending.length > 0) {
    out.push("---");
    out.push(`# flow 미처리 (모니터링, 총 ${sel.pending.length}건)`);
    out.push("");
    out.push(groupsToMarkdown(groupByCategory(sel.pending)));
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

// ===== CSV =====

function csvCell(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

/** 실적 리포트 CSV 생성. 구분 열로 등록완료/제외/미처리 구분(제외·미처리는 아래쪽 정렬). (FR-19) */
export function buildCsv(tasks: Task[], start: string, end: string): string {
  const sel = selectForReport(tasks, start, end);
  const rows: string[][] = [];
  rows.push(["완료일", "구분", "대분류", "소분류", "제목", "카테고리", "등록일"]);

  // 등록완료 → 제외 → 미처리 순으로 쌓아 제외·미처리가 아래쪽에 오도록 한다.
  const order: Disposition[] = ["registered", "excluded", "pending"];
  for (const disp of order) {
    for (const t of sel[disp]) {
      const { major, minor } = t.category
        ? parseCategory(t.category)
        : { major: MISC, minor: null };
      rows.push([
        t.completedAt ? t.completedAt.slice(0, 10) : "",
        dispositionLabel[disp],
        major === "" ? MISC : major,
        minor ?? "",
        t.title,
        t.category ?? "",
        t.createdAt.slice(0, 10),
      ]);
    }
  }
  // Excel 한글 호환을 위해 UTF-8 BOM 포함
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

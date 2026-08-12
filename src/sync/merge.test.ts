import { describe, it, expect } from "vitest";
import type { Task } from "../api";
import { mergeTasks } from "./merge";

function mk(id: string, updatedAt: string, extra: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    category: null,
    status: "active",
    pinned: false,
    dueDate: null,
    createdAt: updatedAt,
    completedAt: null,
    flowStatus: null,
    flowProcessedAt: null,
    deleted: false,
    deletedAt: null,
    updatedAt,
    ...extra,
  };
}

describe("mergeTasks (양방향 last-write-wins)", () => {
  it("로컬 신규는 merged 포함 + toPush", () => {
    const { merged, toPush } = mergeTasks([mk("a", "2026-01-01T00:00:00+09:00")], []);
    expect(merged.map((t) => t.id)).toEqual(["a"]);
    expect(toPush.map((t) => t.id)).toEqual(["a"]);
  });

  it("원격 신규는 merged 포함 + toPush 아님", () => {
    const { merged, toPush } = mergeTasks([], [mk("b", "2026-01-01T00:00:00+09:00")]);
    expect(merged.map((t) => t.id)).toEqual(["b"]);
    expect(toPush).toHaveLength(0);
  });

  it("로컬이 더 최신이면 로컬 채택 + push", () => {
    const local = [mk("x", "2026-02-02T00:00:00+09:00", { title: "new" })];
    const remote = [mk("x", "2026-01-01T00:00:00+09:00", { title: "old" })];
    const { merged, toPush } = mergeTasks(local, remote);
    expect(merged[0].title).toBe("new");
    expect(toPush).toHaveLength(1);
  });

  it("원격이 더 최신이면 원격 채택 + push 아님", () => {
    const local = [mk("x", "2026-01-01T00:00:00+09:00", { title: "old" })];
    const remote = [mk("x", "2026-03-03T00:00:00+09:00", { title: "newer" })];
    const { merged, toPush } = mergeTasks(local, remote);
    expect(merged[0].title).toBe("newer");
    expect(toPush).toHaveLength(0);
  });

  it("삭제(deleted)도 updatedAt 최신이면 전파", () => {
    const local = [mk("x", "2026-04-04T00:00:00+09:00", { deleted: true })];
    const remote = [mk("x", "2026-01-01T00:00:00+09:00")];
    const { merged } = mergeTasks(local, remote);
    expect(merged[0].deleted).toBe(true);
  });
});

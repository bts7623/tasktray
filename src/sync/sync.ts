// 동기화 오케스트레이션: 로컬 우선 + 온라인 시 양방향 병합.
// 1) 로컬 로드 → 2) 원격 로드 → 3) 병합(updatedAt 최신) → 4) 로컬 저장 → 5) 변경분 원격 upsert.

import { loadTasks, saveTasks } from "../api";
import { supabase } from "../supabase";
import { mergeTasks } from "./merge";
import { rowToTask, taskToRow, type TaskRow } from "./map";

export interface SyncResult {
  pulled: number; // 원격에서 받은 레코드 수
  pushed: number; // 원격으로 올린 레코드 수
}

export async function syncNow(userId: string): Promise<SyncResult> {
  if (!supabase) throw new Error("Supabase 미설정 (.env.local 확인)");

  // 1) 로컬
  const localLoad = await loadTasks();
  const local = localLoad.file.tasks;

  // 2) 원격 (본인 데이터만, RLS)
  const { data, error } = await supabase.from("tasks").select("*");
  if (error) throw new Error(`원격 조회 실패: ${error.message}`);
  const remote = (data as TaskRow[]).map(rowToTask);

  // 3) 병합
  const { merged, toPush } = mergeTasks(local, remote);

  // 4) 로컬 저장(원격에서 온 최신본 반영)
  await saveTasks({ schemaVersion: localLoad.file.schemaVersion, tasks: merged });

  // 5) 로컬이 더 최신/신규인 것만 원격에 upsert
  if (toPush.length > 0) {
    const rows = toPush.map((t) => taskToRow(t, userId));
    const { error: upErr } = await supabase.from("tasks").upsert(rows);
    if (upErr) throw new Error(`원격 업로드 실패: ${upErr.message}`);
  }

  return { pulled: remote.length, pushed: toPush.length };
}

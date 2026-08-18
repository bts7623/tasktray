// 웹(PWA)에서의 데이터 접근 — Supabase 직접 읽기/쓰기. (로컬 파일 없음)

import type { Task } from "../api";
import { supabase } from "../supabase";
import { rowToTask, taskToRow, type TaskRow } from "../sync/map";

/** 내 모든 Task 로드(삭제 포함 — 화면 필터에서 걸러짐). */
export async function cloudLoad(): Promise<Task[]> {
  if (!supabase) throw new Error("Supabase 미설정 (.env.local)");
  const { data, error } = await supabase.from("tasks").select("*");
  if (error) throw new Error(error.message);
  return (data as TaskRow[]).map(rowToTask);
}

/** Task 1건 저장(생성/수정 공통). */
export async function cloudUpsert(task: Task, userId: string): Promise<void> {
  if (!supabase) throw new Error("Supabase 미설정 (.env.local)");
  const { error } = await supabase.from("tasks").upsert(taskToRow(task, userId));
  if (error) throw new Error(error.message);
}

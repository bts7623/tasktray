// Task(camelCase) ↔ Supabase 행(snake_case) 매핑.

import type { Task } from "../api";

export interface TaskRow {
  id: string;
  user_id?: string;
  title: string;
  category: string | null;
  status: string;
  pinned: boolean;
  due_date: string | null;
  created_at: string;
  completed_at: string | null;
  flow_status: string | null;
  flow_processed_at: string | null;
  deleted: boolean;
  deleted_at: string | null;
  updated_at: string;
}

export function taskToRow(t: Task, userId: string): TaskRow {
  return {
    id: t.id,
    user_id: userId,
    title: t.title,
    category: t.category,
    status: t.status,
    pinned: t.pinned,
    due_date: t.dueDate,
    created_at: t.createdAt,
    completed_at: t.completedAt,
    flow_status: t.flowStatus,
    flow_processed_at: t.flowProcessedAt,
    deleted: t.deleted,
    deleted_at: t.deletedAt,
    updated_at: t.updatedAt,
  };
}

export function rowToTask(r: TaskRow): Task {
  return {
    id: r.id,
    title: r.title ?? "",
    category: r.category ?? null,
    status: (r.status as Task["status"]) ?? "active",
    pinned: Boolean(r.pinned),
    dueDate: r.due_date ?? null,
    createdAt: r.created_at ?? "",
    completedAt: r.completed_at ?? null,
    flowStatus: (r.flow_status as Task["flowStatus"]) ?? null,
    flowProcessedAt: r.flow_processed_at ?? null,
    deleted: Boolean(r.deleted),
    deletedAt: r.deleted_at ?? null,
    updatedAt: r.updated_at ?? "",
  };
}

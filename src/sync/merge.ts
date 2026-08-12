// 양방향 병합 (순수 로직, 테스트 대상).
// id 별로 updatedAt 이 최신인 쪽을 채택(last-write-wins). 삭제는 deleted 플래그로 전파.
// 시각은 모두 "+09:00" 고정이라 문자열 비교 = 시간순 비교.

import type { Task } from "../api";

export interface MergeResult {
  /** 로컬에 써야 할 최종 집합(id별 최신). */
  merged: Task[];
  /** 원격으로 올려야 할(로컬이 더 최신이거나 원격에 없는) 항목. */
  toPush: Task[];
}

export function mergeTasks(local: Task[], remote: Task[]): MergeResult {
  const byId = new Map<string, Task>();
  for (const r of remote) byId.set(r.id, r);

  const toPush: Task[] = [];
  for (const l of local) {
    const r = byId.get(l.id);
    if (!r) {
      // 원격에 없음 → 로컬 신규, 올려야 함
      byId.set(l.id, l);
      toPush.push(l);
    } else if ((l.updatedAt ?? "") > (r.updatedAt ?? "")) {
      // 로컬이 더 최신 → 채택 + 올림
      byId.set(l.id, l);
      toPush.push(l);
    }
    // 그 외(원격이 최신/동일)는 원격 값을 그대로 둔다(이미 map 에 있음).
  }

  return { merged: Array.from(byId.values()), toPush };
}

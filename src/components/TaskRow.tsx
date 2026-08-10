// Task 1행 (UI-06/07). 보기/편집 모드. active·pin·done 공용.
// 완료 체크(FR-09)/되돌리기(FR-11), Pin 토글(FR-08), 수정(FR-05), 삭제(FR-06).
// flow 등록완료/제외 버튼(UI-07)은 M4에서 추가.

import { useState } from "react";
import type { Task } from "../api";
import { categoryColor, categoryShort, isOverdue, weekdayKo } from "../tasks";

interface Props {
  task: Task;
  onToggleComplete: (task: Task) => void; // active→done, done→active(되돌리기)
  onTogglePin: (task: Task) => void;
  onEdit: (task: Task, patch: { title: string; category: string | null; dueDate: string | null }) => void;
  onDelete: (task: Task) => void;
  onFlow?: (task: Task, flow: "registered" | "excluded") => void; // done 행 flow 처리 (FR-10)
  categoryColors?: Record<string, string>; // 대분류별 지정 색
  onCategoryColor?: (major: string, hex: string) => void; // 카테고리 색 변경
}

export default function TaskRow({
  task,
  onToggleComplete,
  onTogglePin,
  onEdit,
  onDelete,
  onFlow,
  categoryColors,
  onCategoryColor,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [category, setCategory] = useState(task.category ?? "");
  const [dueDate, setDueDate] = useState(task.dueDate ?? "");

  const isDone = task.status === "done";

  const startEdit = () => {
    setTitle(task.title);
    setCategory(task.category ?? "");
    setDueDate(task.dueDate ?? "");
    setEditing(true);
  };

  const saveEdit = () => {
    if (title.trim() === "") return;
    onEdit(task, {
      title: title.trim(),
      category: category.trim() === "" ? null : category.trim(),
      dueDate: dueDate === "" ? null : dueDate,
    });
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="task-row editing">
        <input
          className="edit-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") saveEdit();
            if (e.key === "Escape") setEditing(false);
          }}
          autoFocus
        />
        <div className="edit-row">
          <input
            className="edit-category"
            type="text"
            list="category-suggestions"
            value={category}
            placeholder="카테고리"
            onChange={(e) => setCategory(e.target.value)}
          />
          <input
            className="edit-due"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
        <div className="edit-actions">
          <button className="btn-sm" onClick={saveEdit}>저장</button>
          <button className="btn-sm ghost" onClick={() => setEditing(false)}>취소</button>
        </div>
      </div>
    );
  }

  const overdue = isOverdue(task.dueDate);

  return (
    <div className="task-row">
      {/* 완료 체크박스: active 는 완료 처리, done 은 체크 해제 시 되돌리기 */}
      <input
        className="chk"
        type="checkbox"
        checked={isDone}
        title={isDone ? "완료 취소" : "완료"}
        onChange={() => onToggleComplete(task)}
      />

      <div className="task-main" onDoubleClick={startEdit}>
        <span className={"task-title" + (isDone ? " done" : "")}>{task.title}</span>
        <span className="task-meta">
          {task.category &&
            (() => {
              // 대분류별 색상: 같은 대분류는 같은 색. 칩 클릭 시 색상 변경 (사용자 요청)
              const c = categoryColor(task.category, categoryColors);
              if (!c) return null;
              return (
                <label
                  className="cat"
                  title={`${task.category} · 클릭하여 색상 변경`}
                  style={{ background: c.bg, color: c.fg }}
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                >
                  {categoryShort(task.category)}
                  <input
                    className="cat-color-input"
                    type="color"
                    value={c.bg}
                    onChange={(e) => onCategoryColor?.(c.major, e.target.value)}
                  />
                </label>
              );
            })()}
          {task.dueDate && (
            <span className={"due" + (overdue ? " overdue" : "")} title="종료예정일">
              ~{task.dueDate.slice(5)}({weekdayKo(task.dueDate)})
            </span>
          )}
        </span>
      </div>

      {/* done 행: flow 처리 버튼 상시 노출 (UI-07, FR-10) */}
      {isDone && onFlow && (
        <div className="flow-actions">
          <button
            className="flow-btn reg"
            title="flow 에 등록 완료로 표시하고 종료"
            onClick={() => onFlow(task, "registered")}
          >
            flow 등록
          </button>
          <button
            className="flow-btn exc"
            title="실적 제외로 종료"
            onClick={() => onFlow(task, "excluded")}
          >
            제외
          </button>
        </div>
      )}

      <div className="task-actions">
        {/* Pin 토글은 active 에서만 (done 은 flow 대기 영역) */}
        {!isDone && (
          <button
            className={"icon-btn pin" + (task.pinned ? " on" : "")}
            title={task.pinned ? "오늘 할 일 해제" : "오늘 할 일"}
            onClick={() => onTogglePin(task)}
          >
            ★
          </button>
        )}
        <button className="icon-btn" title="수정" onClick={startEdit}>✎</button>
        <button className="icon-btn" title="삭제" onClick={() => onDelete(task)}>🗑</button>
      </div>
    </div>
  );
}

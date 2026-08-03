// 로우데이터 창 (M5, FR-13~19). 전체 Task 조회·필터·검색, 종료취소, 실적 리포트 내보내기.

import { useEffect, useMemo, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import {
  loadTasks,
  openDataFolder,
  saveTasks,
  writeTextFile,
  type Task,
} from "../api";
import { parseCategory, restoreToDone } from "../tasks";
import { buildCsv, buildMarkdown, type ReportRange } from "../report";

type StatusFilter = "all" | "active" | "done" | "archived" | "deleted";

const STATUS_LABEL: Record<Task["status"], string> = {
  active: "진행 중",
  done: "완료(대기)",
  archived: "종료",
};

const FLOW_LABEL: Record<string, string> = {
  registered: "등록완료",
  excluded: "제외",
};

function d(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

export default function RawData() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [schemaVersion, setSchemaVersion] = useState(1);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [majorFilter, setMajorFilter] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  // 리포트 옵션
  const [range, setRange] = useState<ReportRange>("registeredOnly");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const reload = async () => {
    try {
      const load = await loadTasks();
      setTasks(load.file.tasks);
      setSchemaVersion(load.file.schemaVersion);
    } catch (e) {
      setError(String(e));
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  // 대분류 필터 후보
  const majors = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) {
      if (t.category) set.add(parseCategory(t.category).major);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [tasks]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter((t) => {
      // 상태 필터 (FR-15)
      if (status === "deleted") {
        if (!t.deleted) return false;
      } else if (status !== "all") {
        if (t.deleted || t.status !== status) return false;
      }
      // 카테고리(대분류) 필터
      if (majorFilter) {
        const major = t.category ? parseCategory(t.category).major : "";
        if (major !== majorFilter) return false;
      }
      // 텍스트 검색(제목·카테고리)
      if (q) {
        const hay = `${t.title} ${t.category ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [tasks, status, majorFilter, query]);

  const restore = async (task: Task) => {
    // archived → done 종료취소 (FR-11, D-12)
    const next = tasks.map((t) => (t.id === task.id ? restoreToDone(t) : t));
    setTasks(next);
    try {
      await saveTasks({ schemaVersion, tasks: next });
    } catch (e) {
      setError(String(e));
    }
  };

  const exportReport = async (format: "md" | "csv") => {
    const content =
      format === "md" ? buildMarkdown(tasks, range, start, end) : buildCsv(tasks, range, start, end);
    const ext = format;
    const base = `실적리포트_${start || "전체"}_${end || "전체"}.${ext}`;
    try {
      const path = await save({
        defaultPath: base,
        filters: [{ name: format === "md" ? "Markdown" : "CSV", extensions: [ext] }],
      });
      if (!path) return; // 취소
      await writeTextFile(path, content);
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="rawdata">
      <h1>로우데이터</h1>

      {error && <div className="banner banner-error">{error}</div>}

      {/* 필터 (FR-15) */}
      <div className="rd-toolbar">
        <label>
          상태
          <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
            <option value="all">전체</option>
            <option value="active">진행 중</option>
            <option value="done">완료(대기)</option>
            <option value="archived">종료</option>
            <option value="deleted">삭제됨</option>
          </select>
        </label>
        <label>
          카테고리
          <select value={majorFilter} onChange={(e) => setMajorFilter(e.target.value)}>
            <option value="">전체</option>
            {majors.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <input
          className="rd-search"
          type="text"
          placeholder="제목·카테고리 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="rd-count">{filtered.length}건</span>
        <button className="btn" onClick={() => void openDataFolder()}>
          저장 폴더 열기
        </button>
      </div>

      {/* 표 (FR-13/14) */}
      <div className="rd-table-wrap">
        <table className="rd-table">
          <thead>
            <tr>
              <th>제목</th>
              <th>카테고리</th>
              <th>상태</th>
              <th>등록일</th>
              <th>종료예정일</th>
              <th>완료일</th>
              <th>flow 구분</th>
              <th>삭제</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => (
              <tr key={t.id} className={t.deleted ? "row-deleted" : ""}>
                <td className="c-title">{t.title}</td>
                <td>{t.category ?? ""}</td>
                <td>{STATUS_LABEL[t.status]}</td>
                <td>{d(t.createdAt)}</td>
                <td>{t.dueDate ?? ""}</td>
                <td>{d(t.completedAt)}</td>
                <td>{t.flowStatus ? FLOW_LABEL[t.flowStatus] : ""}</td>
                <td>{t.deleted ? "삭제" : ""}</td>
                <td>
                  {t.status === "archived" && !t.deleted && (
                    <button className="btn-sm ghost" onClick={() => void restore(t)}>
                      종료취소
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="rd-empty">
                  표시할 데이터가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 실적 리포트 (FR-17~19) */}
      <div className="rd-report">
        <h2>실적 리포트 내보내기</h2>
        <div className="rd-report-row">
          <label>
            완료일 시작
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label>
            완료일 종료
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
          <label>
            대상 범위
            <select value={range} onChange={(e) => setRange(e.target.value as ReportRange)}>
              <option value="registeredOnly">flow 등록 완료만</option>
              <option value="withExcluded">제외 포함</option>
              <option value="allCompleted">전체 완료(미처리 포함)</option>
            </select>
          </label>
          <button className="btn" onClick={() => void exportReport("md")}>
            Markdown 저장
          </button>
          <button className="btn" onClick={() => void exportReport("csv")}>
            CSV 저장
          </button>
        </div>
        <p className="rd-note">
          KPI 총계는 flow 등록완료 기준입니다. 제외·미처리는 별도 모니터링 섹션으로 표기되며
          총계에 포함되지 않고, 삭제된 항목은 리포트에서 제외됩니다.
        </p>
      </div>
    </div>
  );
}

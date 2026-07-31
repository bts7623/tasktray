// 빠른 입력창 (UI-05 최상단). 제목 Enter/버튼으로 등록. 카테고리 자동완성 + 종료예정일 선택. (FR-01/02)

import { useState } from "react";

interface Props {
  categories: string[]; // 자동완성 후보 (FR-02)
  titleAutoParse: boolean; // 제목 자동분리 On/Off (FR-04)
  onAdd: (rawTitle: string, rawCategory: string | null, dueDate: string | null) => void;
}

const DATALIST_ID = "category-suggestions";

export default function QuickInput({ categories, titleAutoParse, onAdd }: Props) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [dueDate, setDueDate] = useState("");

  const submit = () => {
    if (title.trim() === "") return;
    onAdd(title, category, dueDate === "" ? null : dueDate);
    setTitle("");
    setCategory("");
    setDueDate("");
  };

  return (
    <div className="quick-input">
      <input
        className="qi-title"
        type="text"
        value={title}
        placeholder={
          titleAutoParse ? "제목 입력 (예: 통합정보망_태양광_과업검토)" : "업무를 입력하고 Enter"
        }
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        autoFocus
      />
      <div className="qi-row">
        <input
          className="qi-category"
          type="text"
          list={DATALIST_ID}
          value={category}
          placeholder="카테고리(선택)"
          onChange={(e) => setCategory(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
        <datalist id={DATALIST_ID}>
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <input
          className="qi-due"
          type="date"
          value={dueDate}
          title="종료예정일(선택)"
          onChange={(e) => setDueDate(e.target.value)}
        />
        <button className="qi-add" onClick={submit} title="등록">
          추가
        </button>
      </div>
    </div>
  );
}

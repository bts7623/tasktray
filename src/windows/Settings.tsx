// 환경설정 창. M2: [저장 폴더 열기] 버튼 + 저장 위치 안내.
// 테마·창 크기·자동 실행 등 실제 설정 항목은 M6 (FR-24~28).

import { useEffect, useState } from "react";
import { getDataDir, openDataFolder } from "../api";

export default function Settings() {
  const [dataDir, setDataDir] = useState<string>("");

  useEffect(() => {
    getDataDir()
      .then(setDataDir)
      .catch(() => setDataDir(""));
  }, []);

  return (
    <div className="page">
      <h1>환경설정</h1>

      <section className="setting-group">
        <div className="setting-label">데이터 저장 폴더</div>
        <p className="setting-desc">
          업무 데이터(tasks.json)와 설정은 프로그램이 아래 폴더에서 자동으로 관리합니다.
          경로를 직접 지정할 필요는 없습니다.
        </p>
        {dataDir && <div className="datapath-box">{dataDir}</div>}
        <button className="btn" onClick={() => void openDataFolder()}>
          저장 폴더 열기
        </button>
      </section>

      <p className="empty">그 외 설정(테마·창 크기·자동 실행 등)은 M6에서 구현됩니다.</p>
    </div>
  );
}

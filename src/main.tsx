import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import Panel from "./windows/Panel";
import Settings from "./windows/Settings";
import RawData from "./windows/RawData";
import Help from "./windows/Help";
import { getSettings, type Settings as AppSettings } from "./api";
import { applyTheme } from "./theme";
import "./styles.css";

// 모든 창 공통: 시작 시 테마 적용 + 설정 변경 즉시 반영 (FR-26)
getSettings()
  .then(applyTheme)
  .catch(() => {});
listen<AppSettings>("settings-changed", (e) => applyTheme(e.payload)).catch(() => {});

// 메인 패널 창만 투명 배경(반투명 효과용). 다른 창은 불투명 유지.
try {
  if (getCurrentWindow().label === "main") {
    document.body.classList.add("main-window");
  }
} catch {
  /* 개발 프리뷰 대비 */
}

// 창 라벨에 따라 렌더링할 화면을 결정한다. (main=패널, settings=환경설정, rawdata=로우데이터)
function pickView() {
  let label = "main";
  try {
    label = getCurrentWindow().label;
  } catch {
    // 브라우저 단독 실행(개발 프리뷰) 대비 기본값 유지
  }
  switch (label) {
    case "settings":
      return <Settings />;
    case "rawdata":
      return <RawData />;
    case "help":
      return <Help />;
    default:
      return <Panel />;
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{pickView()}</React.StrictMode>,
);

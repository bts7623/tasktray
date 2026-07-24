import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import Panel from "./windows/Panel";
import Settings from "./windows/Settings";
import RawData from "./windows/RawData";
import "./styles.css";

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
    default:
      return <Panel />;
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{pickView()}</React.StrictMode>,
);

import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import Panel from "./windows/Panel";
import Settings from "./windows/Settings";
import RawData from "./windows/RawData";
import Help from "./windows/Help";
import FeedbackAdmin from "./feedback/FeedbackAdmin";
import WebApp from "./web/WebApp";
import { getSettings, type Settings as AppSettings } from "./api";
import { applyTheme } from "./theme";
import { isTauri } from "./platform";
import "./styles.css";

// 치명적 오류 시 빈 화면(특히 투명 창)에서 원인을 볼 수 있게 표시한다.
function showFatal(msg: string) {
  const root = document.getElementById("root");
  if (root) {
    root.innerHTML =
      '<pre style="margin:0;padding:12px;background:#2a1414;color:#ff9a9a;' +
      'white-space:pre-wrap;word-break:break-all;font-size:12px;height:100%;overflow:auto">' +
      "오류: " +
      msg.replace(/</g, "&lt;") +
      "</pre>";
  }
}
window.addEventListener("error", (e) => showFatal(`${e.message}\n${e.filename}:${e.lineno}`));
window.addEventListener("unhandledrejection", (e) => showFatal(String(e.reason)));

// 웹(PWA)에서만 서비스워커 등록(설치·오프라인). Tauri 에서는 하지 않는다.
if (!isTauri) {
  import("virtual:pwa-register")
    .then(({ registerSW }) => registerSW({ immediate: true }))
    .catch(() => {});
}

// 데스크톱(Tauri) 전용 부트스트랩: 테마 적용·변경 수신·투명 배경. 웹에서는 건너뛴다.
if (isTauri) {
  getSettings()
    .then(applyTheme)
    .catch(() => {});
  listen<AppSettings>("settings-changed", (e) => applyTheme(e.payload)).catch(() => {});
  try {
    if (getCurrentWindow().label === "main") {
      document.body.classList.add("main-window");
    }
  } catch {
    /* 무시 */
  }
}

// 렌더링 대상 결정: 웹이면 WebApp, Tauri면 창 라벨별 화면.
function pickView() {
  if (!isTauri) return <WebApp />;
  let label = "main";
  try {
    label = getCurrentWindow().label;
  } catch {
    /* 기본값 유지 */
  }
  switch (label) {
    case "settings":
      return <Settings />;
    case "rawdata":
      return <RawData />;
    case "help":
      return <Help />;
    case "feedback":
      return <FeedbackAdmin />;
    default:
      return <Panel />;
  }
}

try {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>{pickView()}</React.StrictMode>,
  );
} catch (e) {
  showFatal(String(e));
}

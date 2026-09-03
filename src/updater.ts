// 자동 업데이트 (D-30). tauri-plugin-updater 로 원격 매니페스트(latest.json)를 확인해
// 새 버전이 있으면 사용자 확인 후 다운로드·설치·재시작한다.
//
// interactive=true(수동 [지금 확인]): 최신이면 "최신입니다" 안내, 오류도 표시.
// interactive=false(시작 시 자동): 조용히 확인하고 새 버전 있을 때만 안내(오프라인 등은 무시).

import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { ask, message } from "@tauri-apps/plugin-dialog";

let running = false;

export async function checkForUpdate(interactive: boolean): Promise<void> {
  if (running) return;
  running = true;
  try {
    const update = await check();
    if (!update) {
      if (interactive) {
        await message("TaskTray 는 이미 최신 버전입니다.", { title: "TaskTray 업데이트", kind: "info" });
      }
      return;
    }
    const yes = await ask(
      `TaskTray 새 버전 v${update.version} 이(가) 있습니다.` +
        (update.body ? `\n\n${update.body}` : "") +
        `\n\n지금 업데이트할까요? (설치 후 자동으로 다시 시작됩니다)`,
      { title: "TaskTray 업데이트 있음", kind: "info" },
    );
    if (!yes) return;
    await update.downloadAndInstall();
    await relaunch();
  } catch (e) {
    if (interactive) {
      await message(`TaskTray 업데이트 확인에 실패했습니다.\n${e instanceof Error ? e.message : String(e)}`, {
        title: "TaskTray 업데이트",
        kind: "error",
      });
    }
    // 자동(비대화식)일 땐 조용히 무시(오프라인 등)
  } finally {
    running = false;
  }
}

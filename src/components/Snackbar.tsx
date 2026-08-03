// 스낵바 (M4). flow 처리 직후 '실행취소'를 잠깐 노출한다. (FR-11, D-12)

import { useEffect } from "react";

interface Props {
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
  durationMs?: number;
}

export default function Snackbar({ message, onUndo, onDismiss, durationMs = 6000 }: Props) {
  useEffect(() => {
    const t = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(t);
  }, [message, durationMs, onDismiss]);

  return (
    <div className="snackbar">
      <span className="snackbar-msg">{message}</span>
      <button className="snackbar-undo" onClick={onUndo}>
        실행취소
      </button>
    </div>
  );
}

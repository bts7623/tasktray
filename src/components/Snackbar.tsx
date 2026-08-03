// 스낵바 (M4). flow 처리 직후 '실행취소'를 잠깐 노출한다. (FR-11, D-12)
// 남은 시간을 초 단위로 카운트다운 표시한다.

import { useEffect, useState } from "react";

interface Props {
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
  durationMs?: number;
}

export default function Snackbar({ message, onUndo, onDismiss, durationMs = 6000 }: Props) {
  const [left, setLeft] = useState(Math.ceil(durationMs / 1000));

  useEffect(() => {
    const id = setInterval(() => {
      setLeft((v) => {
        if (v <= 1) {
          clearInterval(id);
          onDismiss();
          return 0;
        }
        return v - 1;
      });
    }, 1000);
    return () => clearInterval(id);
    // 최초 노출 시 1회만 타이머 시작 (onDismiss 는 안정적)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="snackbar">
      <span className="snackbar-msg">{message}</span>
      <span className="snackbar-count" title="남은 시간">
        {left}초
      </span>
      <button className="snackbar-undo" onClick={onUndo}>
        실행취소
      </button>
    </div>
  );
}

// 메인 패널 (트레이 좌클릭 시 우측 하단 표시). M1: 골격만, 실제 Task 기능은 M3~.
// 패널 구성(UI-05): 빠른 입력창 → 오늘 할 일(Pin) → 진행 중(active) → flow 등록 대기(done)

export default function Panel() {
  return (
    <div className="panel">
      <header className="panel-head">
        <span className="panel-title">TaskTray</span>
      </header>

      {/* ① 빠른 입력창 (M3에서 등록 기능 연결) */}
      <div className="quick-input">
        <input type="text" placeholder="업무를 입력하고 Enter (M3 예정)" disabled />
      </div>

      {/* ②~④ 목록 영역 골격 */}
      <section className="section">
        <div className="section-title">오늘 할 일</div>
        <div className="empty">M3에서 구현됩니다.</div>
      </section>
      <section className="section">
        <div className="section-title">진행 중</div>
        <div className="empty">M3에서 구현됩니다.</div>
      </section>
      <section className="section">
        <div className="section-title">flow 등록 대기</div>
        <div className="empty">M4에서 구현됩니다.</div>
      </section>
    </div>
  );
}

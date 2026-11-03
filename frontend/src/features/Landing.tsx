import type { MouseEvent } from 'react';

type LandingProps = {
  onEnter: () => void;
};

const STACK = [
  { icon: '⎈', name: 'K3s',        desc: '경량 Kubernetes' },
  { icon: '⚡', name: 'FastAPI',    desc: 'Python 백엔드' },
  { icon: '⚛', name: 'React',      desc: '프론트엔드' },
  { icon: '◉', name: 'Prometheus', desc: '메트릭 수집' },
  { icon: '▦', name: 'StatefulSet',desc: '영속 스토리지' },
  { icon: '⌨', name: 'RCON',       desc: '서버 제어' },
];

const FAQ = [
  {
    q: '초대 코드는 어떻게 받나요?',
    a: '현재 KubeHost는 비공개 베타로 운영 중입니다. 관리자에게 직접 요청하시면 초대 코드를 발급받을 수 있습니다.',
  },
  {
    q: '어떤 Minecraft 버전을 지원하나요?',
    a: 'Paper 1.21.x를 기본으로 지원합니다. Vanilla·Fabric·Forge 이미지는 추후 추가 예정입니다.',
  },
  {
    q: '서버 데이터는 안전하게 보관되나요?',
    a: 'PersistentVolumeClaim(PVC)을 통해 Worker 노드 로컬 디스크에 저장됩니다. Worker 노드 장애 시 자동 이전은 지원하지 않으므로 중요 데이터는 별도 백업을 권장합니다.',
  },
  {
    q: '서버를 중지해도 데이터가 유지되나요?',
    a: '네. 파드(Pod)를 중지·삭제해도 PVC 데이터는 보존됩니다. 다음 시작 시 동일한 월드 데이터로 재개됩니다.',
  },
];

export function Landing({ onEnter }: LandingProps) {
  function handleBackdrop(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) {
      // no-op
    }
  }

  return (
    <div className="landing-page" onClick={handleBackdrop}>
      {/* ── Nav ─────────────────────────────────────────────── */}
      <nav className="landing-nav" aria-label="사이트 메뉴">
        <a className="landing-nav-brand" href="#hero" onClick={e => e.preventDefault()}>
          <img src="/kubehost-icon.png" alt="" width={32} height={32} style={{borderRadius:'6px'}}/>
          <span className="landing-brand-name">KubeHost</span>
        </a>
        <div className="landing-nav-right">
          <span className="landing-nav-badge">BETA</span>
          <button className="landing-nav-cta" onClick={onEnter}>
            관리 콘솔 접속
          </button>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="landing-hero" id="hero" aria-labelledby="hero-headline">
        <div className="landing-hero-grid-overlay" aria-hidden="true" />
        <div className="landing-hero-orb landing-hero-orb-1" aria-hidden="true" />
        <div className="landing-hero-orb landing-hero-orb-2" aria-hidden="true" />

        <div className="landing-hero-content">
          <span className="landing-eyebrow">K3S · KUBERNETES · MINECRAFT</span>
          <h1 id="hero-headline" className="landing-hero-h1">
            게임 서버를 K8s로,<br />
            <span className="landing-accent-text">단 몇 초 만에.</span>
          </h1>
          <p className="landing-hero-sub">
            Kubernetes 위에서 동작하는 Minecraft 서버 플랫폼.<br />
            배포부터 모니터링까지.
          </p>
          <div className="landing-hero-actions">
            <button className="landing-btn-primary" onClick={onEnter}>
              지금 시작하기
              <span className="landing-btn-arrow" aria-hidden="true">↗</span>
            </button>
            <a className="landing-btn-ghost" href="#features">
              기능 살펴보기
            </a>
          </div>
          <div className="landing-hero-stats" aria-label="플랫폼 지표">
            <div className="landing-hero-stat">
              <strong>K3s</strong>
              <span>경량 Kubernetes</span>
            </div>
            <div className="landing-hero-stat-divider" aria-hidden="true" />
            <div className="landing-hero-stat">
              <strong>StatefulSet</strong>
              <span>영속 스토리지 보장</span>
            </div>
            <div className="landing-hero-stat-divider" aria-hidden="true" />
            <div className="landing-hero-stat">
              <strong>Prometheus</strong>
              <span>실시간 메트릭</span>
            </div>
          </div>
        </div>

        <div className="landing-hero-terminal" aria-label="배포 미리보기">
          <div className="landing-terminal-bar">
            <span className="landing-terminal-dot landing-terminal-dot-r" />
            <span className="landing-terminal-dot landing-terminal-dot-y" />
            <span className="landing-terminal-dot landing-terminal-dot-g" />
            <span className="landing-terminal-title">kubehost deploy</span>
          </div>
          <div className="landing-terminal-body">
            <p className="landing-terminal-line landing-terminal-cmd landing-anim-line" style={{'--li':0} as React.CSSProperties}>
              <span className="landing-terminal-prompt">$</span> kubehost server create --name my-world
            </p>
            <p className="landing-terminal-line landing-terminal-info landing-anim-line" style={{'--li':1} as React.CSSProperties}>
              ▦ StatefulSet 생성 중...
            </p>
            <p className="landing-terminal-line landing-terminal-info landing-anim-line" style={{'--li':2} as React.CSSProperties}>
              ◷ 네임스페이스 격리 적용 중...
            </p>
            <p className="landing-terminal-line landing-terminal-ok landing-anim-line" style={{'--li':3} as React.CSSProperties}>
              ✓ 서버가 배포되었습니다 (2.3s)
            </p>
            <p className="landing-terminal-line landing-terminal-ok landing-anim-line" style={{'--li':4} as React.CSSProperties}>
              ✓ 포트 포워딩: 25565 → mc-my-world:25565
            </p>
            <p className="landing-terminal-line landing-terminal-muted landing-anim-line" style={{'--li':5} as React.CSSProperties}>
              &gt; 서버 상태: <span className="landing-terminal-running">running</span>
            </p>
            <p className="landing-terminal-line landing-terminal-cursor landing-anim-line" style={{'--li':6} as React.CSSProperties}>
              <span className="landing-terminal-prompt">$</span>
              <span className="landing-cursor-blink" aria-hidden="true">█</span>
            </p>
          </div>
        </div>
      </section>

      {/* ── Tech Stack ───────────────────────────────────────── */}
      <section className="landing-stack" aria-label="기술 스택">
        <p className="landing-stack-label">BUILT WITH</p>
        <div className="landing-stack-grid">
          {STACK.map(s => (
            <div className="landing-stack-item" key={s.name}>
              <span className="landing-stack-icon" aria-hidden="true">{s.icon}</span>
              <span className="landing-stack-name">{s.name}</span>
              <span className="landing-stack-desc">{s.desc}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────── */}
      <section className="landing-features" id="features" aria-labelledby="features-heading">
        <div className="landing-section-header">
          <span className="landing-eyebrow">CORE FEATURES</span>
          <h2 id="features-heading" className="landing-section-h2">
            운영을 자동화하는 세 가지 핵심
          </h2>
        </div>
        <div className="landing-feature-grid">
          <article className="landing-feature-card" tabIndex={0}>
            <div className="landing-feature-icon" aria-hidden="true">▦</div>
            <h3 className="landing-feature-title">원클릭 배포</h3>
            <p className="landing-feature-desc">
              K8s StatefulSet을 자동 생성합니다. 네임스페이스 격리로 테넌트 간 완전 분리를 보장합니다.
            </p>
            <ul className="landing-feature-tags">
              <li>StatefulSet</li>
              <li>Namespace 격리</li>
              <li>PVC 자동 프로비저닝</li>
            </ul>
          </article>

          <article className="landing-feature-card" tabIndex={0}>
            <div className="landing-feature-icon" aria-hidden="true">◷</div>
            <h3 className="landing-feature-title">자동 스케줄</h3>
            <p className="landing-feature-desc">
              요일별 시작·종료를 자동화합니다. 미사용 시간에 파드를 정지해 운영 비용을 절감합니다.
            </p>
            <ul className="landing-feature-tags">
              <li>CronJob 연동</li>
              <li>비용 절감</li>
              <li>자동 재시작</li>
            </ul>
          </article>

          <article className="landing-feature-card" tabIndex={0}>
            <div className="landing-feature-icon" aria-hidden="true">▧</div>
            <h3 className="landing-feature-title">실시간 메트릭</h3>
            <p className="landing-feature-desc">
              Prometheus 기반 CPU·메모리 시계열 모니터링. 이상 징후를 즉시 감지합니다.
            </p>
            <ul className="landing-feature-tags">
              <li>Prometheus</li>
              <li>시계열 그래프</li>
              <li>리소스 쿼터</li>
            </ul>
          </article>
        </div>
      </section>

      {/* ── Dashboard Mockup ─────────────────────────────────── */}
      <section className="landing-mockup-section" aria-labelledby="mockup-heading">
        <div className="landing-section-header">
          <span className="landing-eyebrow">DASHBOARD</span>
          <h2 id="mockup-heading" className="landing-section-h2">
            한눈에 보는 관리 콘솔
          </h2>
        </div>
        <div className="landing-mockup" role="img" aria-label="관리 콘솔 UI 미리보기">
          <div className="lm-titlebar">
            <span className="lm-dot lm-dot-r" /><span className="lm-dot lm-dot-y" /><span className="lm-dot lm-dot-g" />
            <span className="lm-url">kubehost.local</span>
          </div>
          <div className="lm-body">
            {/* sidebar */}
            <aside className="lm-sidebar">
              <div className="lm-nav-pill">
                <span className="lm-nav-brand">KubeHost</span>
              </div>
              <div className="lm-server-list">
                <div className="lm-server-item lm-active">
                  <span className="lm-status-dot lm-green" />my-world
                </div>
                <div className="lm-server-item">
                  <span className="lm-status-dot lm-gray" />survival
                </div>
                <div className="lm-server-item lm-add-btn">+ 서버 추가</div>
              </div>
            </aside>
            {/* main */}
            <div className="lm-main">
              <div className="lm-server-header">
                <span className="lm-server-title">my-world</span>
                <span className="lm-badge-running">Running</span>
              </div>
              <div className="lm-metrics-row">
                <div className="lm-metric-card">
                  <span className="lm-metric-label">CPU</span>
                  <div className="lm-bar-track"><div className="lm-bar-fill lm-bar-cpu" /></div>
                  <span className="lm-metric-val">67%</span>
                </div>
                <div className="lm-metric-card">
                  <span className="lm-metric-label">Memory</span>
                  <div className="lm-bar-track"><div className="lm-bar-fill lm-bar-mem" /></div>
                  <span className="lm-metric-val">1.1 GB</span>
                </div>
                <div className="lm-metric-card">
                  <span className="lm-metric-label">Players</span>
                  <div className="lm-bar-track"><div className="lm-bar-fill lm-bar-pl" /></div>
                  <span className="lm-metric-val">3 / 20</span>
                </div>
              </div>
              <div className="lm-console-box">
                <div className="lm-console-line">[INFO] Starting Minecraft server...</div>
                <div className="lm-console-line lm-console-ok">[DONE] Server started on :25565</div>
                <div className="lm-console-line">[INFO] 3 players online</div>
                <div className="lm-console-cursor">█</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────── */}
      <section className="landing-steps" aria-labelledby="steps-heading">
        <div className="landing-section-header">
          <span className="landing-eyebrow">HOW IT WORKS</span>
          <h2 id="steps-heading" className="landing-section-h2">
            세 단계로 완성되는 서버 운영
          </h2>
        </div>
        <ol className="landing-steps-list" aria-label="배포 단계">
          <li className="landing-step">
            <div className="landing-step-num" aria-hidden="true">01</div>
            <div className="landing-step-content">
              <h3 className="landing-step-title">서버 생성</h3>
              <p className="landing-step-desc">
                서버 이름, Minecraft 버전, 리소스 플랜을 입력합니다. Worker 노드를 선택하면 끝입니다.
              </p>
            </div>
          </li>
          <div className="landing-step-connector" aria-hidden="true" />
          <li className="landing-step">
            <div className="landing-step-num" aria-hidden="true">02</div>
            <div className="landing-step-content">
              <h3 className="landing-step-title">K8s 배포</h3>
              <p className="landing-step-desc">
                StatefulSet과 PVC, Service가 자동으로 생성됩니다. 수초 안에 서버가 올라옵니다.
              </p>
            </div>
          </li>
          <div className="landing-step-connector" aria-hidden="true" />
          <li className="landing-step">
            <div className="landing-step-num" aria-hidden="true">03</div>
            <div className="landing-step-content">
              <h3 className="landing-step-title">모니터링</h3>
              <p className="landing-step-desc">
                대시보드에서 CPU·메모리 추이를 확인하고, RCON 콘솔로 서버를 직접 제어합니다.
              </p>
            </div>
          </li>
        </ol>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────── */}
      <section className="landing-faq" aria-labelledby="faq-heading">
        <div className="landing-section-header">
          <span className="landing-eyebrow">FAQ</span>
          <h2 id="faq-heading" className="landing-section-h2">
            자주 묻는 질문
          </h2>
        </div>
        <dl className="landing-faq-list">
          {FAQ.map((item, i) => (
            <details className="landing-faq-item" key={i}>
              <summary className="landing-faq-q">{item.q}</summary>
              <p className="landing-faq-a">{item.a}</p>
            </details>
          ))}
        </dl>
      </section>

      {/* ── CTA ──────────────────────────────────────────────── */}
      <section className="landing-cta" aria-labelledby="cta-heading">
        <div className="landing-cta-inner">
          <div className="landing-cta-orb" aria-hidden="true" />
          <span className="landing-eyebrow">ACCESS</span>
          <h2 id="cta-heading" className="landing-cta-h2">
            초대 코드가 있으신가요?
          </h2>
          <p className="landing-cta-sub">
            현재 초대 코드를 통한 가입만 허용합니다.<br />
            관리자에게 코드를 요청하세요.
          </p>
          <button className="landing-btn-primary landing-cta-btn" onClick={onEnter}>
            관리 콘솔 접속하기
            <span className="landing-btn-arrow" aria-hidden="true">↗</span>
          </button>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="landing-footer">
        <span className="landing-footer-brand">KubeHost</span>
        <span className="landing-footer-copy">© 2025 · K3s 기반 게임 서버 플랫폼</span>
        <span className="landing-footer-note">Worker 장애 시 로컬 데이터가 자동으로 이동하지 않습니다.</span>
      </footer>
    </div>
  );
}

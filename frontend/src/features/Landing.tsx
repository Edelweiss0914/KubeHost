import { useEffect, type ReactNode } from 'react';
import type { MouseEvent } from 'react';
import { Box, Zap, Atom, Activity, LayoutGrid, Terminal, ArrowUpRight, Clock, Map as MapIcon, Check, Layers } from 'lucide-react';

type LandingProps = {
  onEnter: () => void;
};

const GAMES_ROW1 = [
  { name: 'Valheim',               id: 892970  },
  { name: 'Terraria',              id: 105600  },
  { name: 'ARK: Survival',         id: 346110  },
  { name: 'Rust',                  id: 252490  },
  { name: 'CS2',                   id: 730     },
  { name: "Garry's Mod",           id: 4000    },
  { name: '7 Days to Die',         id: 251570  },
  { name: 'Factorio',              id: 427520  },
];

const GAMES_ROW2 = [
  { name: 'Satisfactory',          id: 526870  },
  { name: 'Project Zomboid',       id: 108600  },
  { name: 'Palworld',              id: 1623730 },
  { name: 'V Rising',              id: 1604030 },
  { name: "Don't Starve Together", id: 322330  },
  { name: 'Space Engineers',       id: 244850  },
  { name: 'Starbound',             id: 211820  },
  { name: 'Team Fortress 2',       id: 440     },
];

const STACK: { icon: ReactNode; name: string; desc: string }[] = [
  { icon: <Box size={18}/>,        name: 'K3s',         desc: '경량 Kubernetes' },
  { icon: <Zap size={18}/>,        name: 'FastAPI',     desc: 'Python 백엔드' },
  { icon: <Atom size={18}/>,       name: 'React',       desc: '프론트엔드' },
  { icon: <Activity size={18}/>,   name: 'Prometheus',  desc: '메트릭 수집' },
  { icon: <Layers size={18}/>,     name: 'StatefulSet', desc: '데이터 영속성' },
  { icon: <Terminal size={18}/>,   name: 'Console',     desc: '서버 제어' },
];

const FAQ = [
  {
    q: '초대 코드는 어떻게 받나요?',
    a: '현재 KubeHost는 비공개 베타로 운영 중입니다. 관리자에게 직접 요청하시면 초대 코드를 발급받을 수 있습니다.',
  },
  {
    q: '어떤 게임을 지원하나요?',
    a: '컨테이너 이미지로 실행 가능한 모든 게임 서버를 지원합니다. 현재는 테스트 환경으로 운영 중이며, 다양한 게임 이미지를 순차적으로 추가할 예정입니다.',
  },
  {
    q: '서버 데이터는 안전하게 보관되나요?',
    a: '게임 데이터는 호스팅 컴퓨터의 로컬 디스크에 저장됩니다. 호스팅 컴퓨터 장애 시 데이터가 자동으로 이동하지 않으므로 중요 데이터는 별도 백업을 권장합니다.',
  },
  {
    q: '서버를 중지해도 데이터가 유지되나요?',
    a: '네. 서버를 중지하거나 삭제해도 게임 데이터는 그대로 보존됩니다. 다음 시작 시 동일한 월드 데이터로 재개됩니다.',
  },
];

function MarqueeRow({ games, reverse }: { games: typeof GAMES_ROW1; reverse?: boolean }) {
  return (
    <div className="landing-marquee">
      <div className={`landing-marquee-track${reverse ? ' landing-marquee-reverse' : ''}`}>
        {[...games, ...games].map((g, i) => (
          <a
            className="landing-marquee-item"
            key={i}
            href={`https://store.steampowered.com/app/${g.id}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${g.name} Steam 상점 페이지`}
          >
            <img
              src={`https://cdn.cloudflare.steamstatic.com/steam/apps/${g.id}/capsule_sm_120.jpg`}
              alt={g.name}
              className="landing-marquee-img"
              loading="lazy"
            />
            {g.name}
          </a>
        ))}
      </div>
    </div>
  );
}

export function Landing({ onEnter }: LandingProps) {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>('.landing-reveal');
    const io = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('landing-reveal-visible'); io.unobserve(e.target); }
      }),
      { threshold: 0.1 }
    );
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);

  function handleBackdrop(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) { /* no-op */ }
  }

  return (
    <div className="landing-page" onClick={handleBackdrop}>

      {/* ── Nav ─────────────────────────────────────────────── */}
      <nav className="landing-nav" aria-label="사이트 메뉴">
        <a className="landing-nav-brand" href="#hero" onClick={e => e.preventDefault()}>
          <img src="/kubehost-icon.png" alt="" width={32} height={32} style={{borderRadius:'6px'}}/>
          <span className="landing-brand-name">KubeHost</span>
        </a>
        <div className="landing-nav-links">
          <a href="#features" className="landing-nav-link">기능</a>
          <a href="#faq" className="landing-nav-link">FAQ</a>
        </div>
        <div className="landing-nav-right">
          <span className="landing-nav-badge">BETA</span>
          <button className="landing-nav-cta" onClick={onEnter}>
            관리 콘솔 접속
          </button>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="landing-hero landing-hero-enter" id="hero" aria-labelledby="hero-headline">
        <div className="landing-hero-grid-overlay" aria-hidden="true" />
        <div className="landing-hero-orb landing-hero-orb-1" aria-hidden="true" />

        <div className="landing-hero-content">
          <h1 id="hero-headline" className="landing-hero-h1 landing-hero-enter-1">
            게임 서버를 K8s로,<br />
            클릭 몇 번으로.
          </h1>
          <p className="landing-hero-sub landing-hero-enter-3">
            Kubernetes 위에서 동작하는 게임 서버 호스팅 플랫폼.<br />
            배포부터 모니터링까지.
          </p>
          <div className="landing-hero-actions landing-hero-enter-4">
            <button className="landing-btn-primary" onClick={onEnter}>
              지금 시작하기
              <span className="landing-btn-arrow" aria-hidden="true"><ArrowUpRight size={16}/></span>
            </button>
            <a className="landing-btn-ghost" href="#features">
              기능 살펴보기
            </a>
          </div>
          <div className="landing-hero-stats landing-hero-enter-5" aria-label="플랫폼 지표">
            <div className="landing-hero-stat">
              <strong>16+</strong>
              <span>지원 게임</span>
            </div>
            <div className="landing-hero-stat-divider" aria-hidden="true" />
            <div className="landing-hero-stat">
              <strong>수 분</strong>
              <span>서버 배포 시간</span>
            </div>
            <div className="landing-hero-stat-divider" aria-hidden="true" />
            <div className="landing-hero-stat">
              <strong>실시간</strong>
              <span>메트릭 모니터링</span>
            </div>
          </div>
        </div>

        <div className="landing-hero-terminal landing-hero-enter-6" aria-label="배포 미리보기">
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
              <LayoutGrid size={12}/> StatefulSet 생성 중...
            </p>
            <p className="landing-terminal-line landing-terminal-info landing-anim-line" style={{'--li':2} as React.CSSProperties}>
              <Clock size={12}/> 네임스페이스 격리 적용 중...
            </p>
            <p className="landing-terminal-line landing-terminal-ok landing-anim-line" style={{'--li':3} as React.CSSProperties}>
              <Check size={12}/>서버가 배포되었습니다 (23s)
            </p>
            <p className="landing-terminal-line landing-terminal-ok landing-anim-line" style={{'--li':4} as React.CSSProperties}>
              <Check size={12}/>포트 포워딩: 7777 → game-my-world:7777
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

      {/* ── Games Marquee (2 rows) ────────────────────────────── */}
      <div className="landing-marquee-wrap" aria-label="지원 게임 목록">
        <MarqueeRow games={GAMES_ROW1} />
        <MarqueeRow games={GAMES_ROW2} reverse />
      </div>

      {/* ── Features ─────────────────────────────────────────── */}
      <section className="landing-features landing-reveal" id="features" aria-labelledby="features-heading">
        <div className="landing-section-header">
          <h2 id="features-heading" className="landing-section-h2">
            운영을 자동화하는 세 가지 핵심
          </h2>
        </div>
        <div className="landing-feature-grid">
          <article className="landing-feature-card" tabIndex={0}>
            <div className="landing-feature-icon" aria-hidden="true"><LayoutGrid size={28}/></div>
            <h3 className="landing-feature-title">원클릭 배포</h3>
            <p className="landing-feature-desc">
              게임 서버를 버튼 하나로 생성합니다. 각 서버는 완전히 분리된 환경에서 실행되며 저장소가 자동으로 할당됩니다.
            </p>
            <ul className="landing-feature-tags">
              <li>원클릭 생성</li>
              <li>서버 간 완전 분리</li>
              <li>자동 저장소 할당</li>
            </ul>
          </article>
          <article className="landing-feature-card" tabIndex={0}>
            <div className="landing-feature-icon" aria-hidden="true"><Clock size={28}/></div>
            <h3 className="landing-feature-title">자동 스케줄</h3>
            <p className="landing-feature-desc">
              요일별 시작·종료를 자동화합니다. 사용하지 않는 시간에 서버를 자동으로 멈춰 리소스를 절약합니다.
            </p>
            <ul className="landing-feature-tags">
              <li>예약 시작·종료</li>
              <li>리소스 절약</li>
              <li>자동 재시작</li>
            </ul>
          </article>
          <article className="landing-feature-card" tabIndex={0}>
            <div className="landing-feature-icon" aria-hidden="true"><MapIcon size={28}/></div>
            <h3 className="landing-feature-title">실시간 메트릭</h3>
            <p className="landing-feature-desc">
              CPU·메모리 사용량을 실시간 그래프로 확인합니다. 이상 징후를 즉시 감지하고 서버 상태를 한눈에 파악합니다.
            </p>
            <ul className="landing-feature-tags">
              <li>실시간 그래프</li>
              <li>CPU·메모리 추적</li>
              <li>사용량 제한 설정</li>
            </ul>
          </article>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────── */}
      <section className="landing-steps landing-reveal" aria-labelledby="steps-heading">
        <div className="landing-section-header">
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
                서버 이름, 게임 종류, 리소스 플랜을 입력합니다. 호스팅 노드를 선택하면 끝입니다.
              </p>
            </div>
          </li>
          <div className="landing-step-connector" aria-hidden="true" />
          <li className="landing-step">
            <div className="landing-step-num" aria-hidden="true">02</div>
            <div className="landing-step-content">
              <h3 className="landing-step-title">K8s 배포</h3>
              <p className="landing-step-desc">
                서버, 저장소, 네트워크가 자동으로 구성됩니다. 몇 분 안에 서버가 올라옵니다.
              </p>
            </div>
          </li>
          <div className="landing-step-connector" aria-hidden="true" />
          <li className="landing-step">
            <div className="landing-step-num" aria-hidden="true">03</div>
            <div className="landing-step-content">
              <h3 className="landing-step-title">모니터링</h3>
              <p className="landing-step-desc">
                대시보드에서 CPU·메모리 추이를 확인하고, 콘솔로 서버를 직접 제어합니다.
              </p>
            </div>
          </li>
        </ol>
      </section>

      {/* ── Dashboard Mockup ─────────────────────────────────── */}
      <section className="landing-mockup-section landing-reveal" aria-labelledby="mockup-heading">
        <div className="landing-section-header">
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
            <aside className="lm-sidebar">
              <div className="lm-nav-pill"><span className="lm-nav-brand">KubeHost</span></div>
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
                <div className="lm-console-line">[INFO] Starting game server...</div>
                <div className="lm-console-line lm-console-ok">[DONE] Server started on :7777</div>
                <div className="lm-console-line">[INFO] 3 players online</div>
                <div className="lm-console-cursor">█</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────── */}
      <section className="landing-faq landing-reveal" id="faq" aria-labelledby="faq-heading">
        <div className="landing-section-header">
          <h2 id="faq-heading" className="landing-section-h2">자주 묻는 질문</h2>
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

      {/* ── Tech Stack ───────────────────────────────────────── */}
      <section className="landing-stack landing-reveal" aria-label="기술 스택">
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

      {/* ── CTA ──────────────────────────────────────────────── */}
      <section className="landing-cta landing-reveal" aria-labelledby="cta-heading">
        <div className="landing-cta-inner">
          <h2 id="cta-heading" className="landing-cta-h2">초대 코드가 있으신가요?</h2>
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

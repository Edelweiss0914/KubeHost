import { useState } from 'react';

const STEPS = [
  {
    icon: '⬡',
    title: 'KubeHost에 오신 것을 환영합니다!',
    body: 'KubeHost는 개인 Kubernetes 클러스터에서 Minecraft 서버를 쉽게 배포하고 관리할 수 있는 플랫폼입니다.',
  },
  {
    icon: '⛏',
    title: '서버 만들기',
    body: '상단의 "서버 만들기" 버튼을 눌러 호스트 서버와 리소스를 선택한 뒤 Minecraft 서버를 배포하세요. 배포에는 1-2분 정도 소요됩니다.',
  },
  {
    icon: '◉',
    title: '서버 접속',
    body: '서버가 실행 상태가 되면 접속 주소(IP:포트)가 표시됩니다. Minecraft 멀티플레이어 → 서버 추가에서 해당 주소를 입력하면 접속할 수 있습니다.',
  },
  {
    icon: '⚒',
    title: '서버 관리',
    body: '서버 상세 페이지에서 콘솔, 플레이어 관리, 화이트리스트, OP 권한, 백업, JVM 메모리, 스케줄 등 다양한 기능을 사용할 수 있습니다.',
  },
];

const STORAGE_KEY = 'kubehost-onboarding-done';

export function needsOnboarding(): boolean {
  try { return !localStorage.getItem(STORAGE_KEY); } catch { return false; }
}

export function markOnboardingDone(): void {
  try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* ignore */ }
}

export function OnboardingModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  function finish() {
    markOnboardingDone();
    onClose();
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="시작 안내">
      <div className="modal onboarding-modal">
        <div className="onboarding-step-indicator">
          {STEPS.map((_, i) => (
            <span key={i} className={`onboarding-dot${i === step ? ' active' : i < step ? ' done' : ''}`} />
          ))}
        </div>
        <div className="onboarding-icon" aria-hidden="true">{current.icon}</div>
        <h2 className="onboarding-title">{current.title}</h2>
        <p className="onboarding-body">{current.body}</p>
        <div className="onboarding-actions">
          {step > 0 && (
            <button className="secondary" onClick={() => setStep(s => s - 1)}>이전</button>
          )}
          {isLast ? (
            <button onClick={finish}>시작하기</button>
          ) : (
            <button onClick={() => setStep(s => s + 1)}>다음</button>
          )}
        </div>
        <button className="text-button onboarding-skip" onClick={finish}>건너뛰기</button>
      </div>
    </div>
  );
}

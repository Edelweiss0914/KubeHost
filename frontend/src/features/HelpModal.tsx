import { Server, Wifi, Wrench, Clock, FolderOpen, X } from 'lucide-react';
import type { ReactNode } from 'react';

const SECTIONS: { icon: ReactNode; title: string; body: string }[] = [
  {
    icon: <Server size={18}/>,
    title: '서버 만들기',
    body: '"+ 서버 만들기" 버튼을 눌러 호스트 서버와 리소스(CPU·메모리·스토리지)를 선택하세요. 배포에는 약 1–2분 소요됩니다.',
  },
  {
    icon: <Wifi size={18}/>,
    title: '서버 접속',
    body: '서버 상태가 "실행 중"이 되면 접속 주소(IP:포트)가 표시됩니다. 게임 클라이언트의 멀티플레이어 서버 추가 화면에서 해당 주소를 입력하세요.',
  },
  {
    icon: <Wrench size={18}/>,
    title: '서버 관리',
    body: '서버 상세 → 관리 탭에서 메모리 프리셋, 자동 재시작, 화이트리스트, OP 권한, 차단, 백업, 설정 파일 편집이 가능합니다.',
  },
  {
    icon: <Clock size={18}/>,
    title: '스케줄 자동화',
    body: '서버 상세 → 스케줄 탭에서 요일·시간대별 자동 시작·종료를 설정할 수 있습니다.',
  },
  {
    icon: <FolderOpen size={18}/>,
    title: '파일 관리',
    body: '서버 상세 → 파일 탭에서 서버 파일을 직접 탐색·업로드·다운로드·삭제할 수 있습니다.',
  },
];

export function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="도움말" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal help-modal">
        <div className="modal-header">
          <h2>도움말</h2>
          <button className="text-button" onClick={onClose} aria-label="닫기"><X size={16}/></button>
        </div>
        <div className="help-sections">
          {SECTIONS.map(s => (
            <div key={s.title} className="help-section">
              <span className="help-section-icon" aria-hidden="true">{s.icon}</span>
              <div>
                <strong>{s.title}</strong>
                <p>{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

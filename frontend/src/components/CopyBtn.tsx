import { useState, useCallback } from 'react';
import { Check, Copy } from 'lucide-react';

type Props = {
  text: string | null;
  stopPropagation?: boolean;
};

export function CopyBtn({ text, stopPropagation }: Props) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback((e: React.MouseEvent) => {
    if (stopPropagation) e.stopPropagation();
    if (!text) return;
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 2000); };
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(done).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta); done();
      });
    } else {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta); done();
    }
  }, [text, stopPropagation]);
  if (!text) return null;
  return (
    <button className={`copy-btn${copied ? ' copied' : ''}`} onClick={copy} title="클립보드에 복사">
      {copied ? <><Check size={13}/> 복사됨</> : <><Copy size={13}/> 복사</>}
    </button>
  );
}

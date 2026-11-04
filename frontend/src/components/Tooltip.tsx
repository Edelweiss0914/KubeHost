import { useState } from 'react';

export function Tooltip({ text, children }: { text: string; children?: React.ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <span className="tooltip-wrap"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      {children}
      <span className="tooltip-icon" tabIndex={0} aria-label={text} role="tooltip">?</span>
      {show && <span className="tooltip-bubble" role="tooltip">{text}</span>}
    </span>
  );
}

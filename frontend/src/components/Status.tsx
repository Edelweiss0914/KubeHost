import { Circle } from 'lucide-react';

export function Status({value}:{value:string}) {
  const labels:Record<string,string>={
    running:'실행 중',
    stopped:'중지됨',
    provisioning:'시작 중',
    error:'오류',
    Ready:'정상',
    NotReady:'비정상',
  };
  return <span className={`status status-${value.toLowerCase()}`}>
    <Circle size={8} fill="currentColor" aria-hidden="true"/> {labels[value]??value}
  </span>;
}

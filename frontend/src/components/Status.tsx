export function Status({value}:{value:string}) {const labels:Record<string,string>={running:'실행 중',stopped:'중지됨',Ready:'정상'};return <span className={`status status-${value.toLowerCase()}`}><span aria-hidden="true">●</span> {labels[value]??value}</span>;}


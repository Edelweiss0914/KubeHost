"""Server auto-start/stop scheduler. Runs in a background thread."""
import logging
import threading
import time
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


def _now_hhmm(tz_name: str) -> tuple[int, str]:
    """현재 요일(0=월)과 HH:MM 반환."""
    try:
        from zoneinfo import ZoneInfo
        now = datetime.now(ZoneInfo(tz_name))
    except Exception:
        now = datetime.now(timezone.utc)
    weekday = now.weekday()  # 0=월 ~ 6=일
    return weekday, now.strftime("%H:%M")


class SchedulerService:
    def __init__(self, server_service, repository) -> None:
        self._server_svc = server_service
        self._repo = repository
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        self._last_fired: dict[str, str] = {}  # schedule_id -> "HH:MM" 중복 실행 방지

    def start(self) -> None:
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._loop, daemon=True, name="scheduler")
        self._thread.start()
        logger.info("Scheduler started")

    def stop(self) -> None:
        self._stop_event.set()

    def _loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                self._tick()
            except Exception:
                logger.exception("Scheduler tick error")
            self._stop_event.wait(60)  # 1분마다 체크

    def _tick(self) -> None:
        schedules = self._repo.list_all_schedules()
        for s in schedules:
            weekday, hhmm = _now_hhmm(s.get("timezone", "Asia/Seoul"))
            days = s.get("days", [])
            # days가 비어있으면 매일, 아니면 해당 요일만
            if days and weekday not in days:
                continue

            sid = s["id"]
            server_id = s["server_id"]

            # 시작 처리
            if s.get("start_time") == hhmm and self._last_fired.get(f"{sid}:start") != hhmm:
                self._last_fired[f"{sid}:start"] = hhmm
                try:
                    server = self._repo.get(server_id)
                    if server and server.status != "running":
                        self._server_svc.set_state(server.owner_id, server_id, "running")
                        logger.info("Scheduler: started server %s", server_id)
                except Exception:
                    logger.exception("Scheduler: failed to start server %s", server_id)

            # 종료 처리
            if s.get("stop_time") == hhmm and self._last_fired.get(f"{sid}:stop") != hhmm:
                self._last_fired[f"{sid}:stop"] = hhmm
                try:
                    server = self._repo.get(server_id)
                    if server and server.status == "running":
                        self._server_svc.set_state(server.owner_id, server_id, "stopped")
                        logger.info("Scheduler: stopped server %s", server_id)
                except Exception:
                    logger.exception("Scheduler: failed to stop server %s", server_id)

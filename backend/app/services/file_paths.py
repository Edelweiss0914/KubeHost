"""Game-specific file-manager roots and persistent write boundaries."""
import posixpath

from app.services.gmod_storage import GMOD_ROOT


FILE_ROOTS = {
    "minecraft-java": "/data",
    "garrysmod": GMOD_ROOT,
}


def file_root(game: str) -> str:
    try:
        return FILE_ROOTS[game]
    except KeyError as exc:
        raise ValueError("이 게임의 파일 매니저는 아직 지원하지 않습니다.") from exc


def file_path(game: str, path: str | None, *, write: bool = False) -> str:
    root = file_root(game)
    requested = (path or root).strip()
    if not requested.startswith("/"):
        requested = f"{root}/{requested}"
    normalized = posixpath.normpath(requested)
    if normalized != root and not normalized.startswith(root + "/"):
        raise ValueError("서버 파일 경로를 벗어날 수 없습니다.")
    if any(char in normalized for char in ("'", '"', "\\", "\x00", "\r", "\n", "\t")):
        raise ValueError("경로에 사용할 수 없는 문자가 포함돼 있습니다.")
    if write and normalized == root:
        raise ValueError("파일 매니저의 루트는 수정할 수 없습니다.")
    return normalized

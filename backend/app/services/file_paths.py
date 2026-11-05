"""Game-specific file-manager roots and persistent write boundaries."""
import posixpath

LIBRARY_ROOT = "/library"


def library_path(path: str | None, *, write: bool = False) -> str:
    root = LIBRARY_ROOT
    requested = (path or root).strip()
    if not requested.startswith("/"):
        requested = f"{root}/{requested}"
    normalized = posixpath.normpath(requested)
    if normalized != root and not normalized.startswith(root + "/"):
        raise ValueError("라이브러리 경로를 벗어날 수 없습니다.")
    if any(char in normalized for char in ("'", '"', "\\", "\x00", "\r", "\n", "\t")):
        raise ValueError("경로에 사용할 수 없는 문자가 포함돼 있습니다.")
    if write and normalized == root:
        raise ValueError("라이브러리 루트는 수정할 수 없습니다.")
    return normalized


def file_root(game: str) -> str:
    from app.games.registry import GAMES
    definition = GAMES.get(game)
    if definition is None or "file_manager" not in definition.capabilities:
        raise ValueError("이 게임의 파일 매니저는 아직 지원하지 않습니다.")
    return definition.file_root


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

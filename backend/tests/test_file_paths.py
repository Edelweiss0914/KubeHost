import pytest

from app.services.file_paths import file_path, file_root
from app.adapters.mock import MockKubernetesAdapter


def test_gmod_can_browse_and_edit_all_game_files():
    root = file_root("garrysmod")
    assert file_path("garrysmod", None) == root
    assert file_path("garrysmod", "maps/gm_flatgrass.bsp") == f"{root}/maps/gm_flatgrass.bsp"
    for folder in ("data", "addons", "cfg", "maps", "gamemodes", "lua"):
        assert file_path("garrysmod", f"{folder}/custom.txt", write=True) == f"{root}/{folder}/custom.txt"


@pytest.mark.parametrize("path", [
    "/home/gmod/server/srcds_run", "../../etc/passwd", ".",
])
def test_gmod_write_cannot_escape_or_replace_manager_root(path):
    with pytest.raises(ValueError):
        file_path("garrysmod", path, write=True)


def test_file_paths_reject_traversal_and_unsupported_games():
    with pytest.raises(ValueError):
        file_path("minecraft-java", "/data/../../etc/passwd")
    with pytest.raises(ValueError):
        file_path("garrysmod", "addons/bad'name", write=True)
    with pytest.raises(ValueError):
        file_root("valheim")


def test_mock_gmod_file_manager_edits_game_tree():
    adapter = MockKubernetesAdapter()
    root = file_root("garrysmod")
    entries = adapter.list_files("server", "tenant", root, game="garrysmod")
    assert {entry["name"] for entry in entries} >= {"data", "addons", "cfg", "maps"}
    path = f"{root}/gamemodes/custom/init.lua"
    adapter.write_file("server", "tenant", path, b"print('hello')", game="garrysmod")
    assert adapter.read_file("server", "tenant", path, game="garrysmod") == b"print('hello')"
    adapter.delete_path("server", "tenant", path, game="garrysmod")
    with pytest.raises(ValueError):
        adapter.read_file("server", "tenant", path, game="garrysmod")

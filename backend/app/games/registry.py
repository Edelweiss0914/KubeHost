"""Game registry — the single source of truth for all supported games."""
from app.games.base import GameDefinition
from app.games.garrysmod import GarrysMod
from app.games.minecraft_java import MinecraftJava
from app.games.valheim import Valheim

GAMES: dict[str, GameDefinition] = {
    "minecraft-java": MinecraftJava(),
    "garrysmod":      GarrysMod(),
    "valheim":        Valheim(),
}


def get_game(slug: str) -> GameDefinition:
    game = GAMES.get(slug)
    if game is None:
        raise ValueError(f"지원하지 않는 게임입니다: {slug}")
    return game

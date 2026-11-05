"""Persistent GMod file layout shared by new plans and existing-server upgrades."""

GMOD_IMAGE = "ceifa/garrysmod:latest"
GMOD_ROOT = "/home/gmod/server/garrysmod"


def gmod_volume_mounts() -> list[dict[str, str]]:
    return [
        {"name": "data", "mountPath": GMOD_ROOT, "subPath": "game-files"},
        {"name": "data", "mountPath": f"{GMOD_ROOT}/data", "subPath": "garrysmod/data"},
        {"name": "data", "mountPath": f"{GMOD_ROOT}/addons", "subPath": "garrysmod/addons"},
        {"name": "data", "mountPath": f"{GMOD_ROOT}/cfg", "subPath": "garrysmod/cfg"},
    ]


def gmod_file_init_container() -> dict:
    script = """set -eu
mkdir -p /volume/game-files /volume/garrysmod/data /volume/garrysmod/addons /volume/garrysmod/cfg
if [ ! -f /volume/.kubehost-gmod-initialized ]; then
  echo 'Preparing GMod files in persistent storage (one-time copy)...'
  cp -a /home/gmod/server/garrysmod/. /volume/game-files/
  touch /volume/.kubehost-gmod-initialized
fi
for folder in addons cfg; do
  if [ -d "/home/gmod/server/garrysmod/$folder" ]; then
    cp -an "/home/gmod/server/garrysmod/$folder/." "/volume/garrysmod/$folder/"
  fi
done
echo 'GMod files ready.'"""
    return {
        "name": "prepare-gmod-files",
        "image": GMOD_IMAGE,
        "command": ["/bin/sh", "-ec", script],
        "securityContext": {"allowPrivilegeEscalation": False},
        "resources": {
            "requests": {"cpu": "100m", "memory": "128Mi"},
            "limits": {"cpu": "500m", "memory": "512Mi"},
        },
        "volumeMounts": [{"name": "data", "mountPath": "/volume"}],
    }

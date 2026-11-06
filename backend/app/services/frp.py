"""frp proxy manager client — registers/unregisters NodePort tunnels."""
import json
import os
import urllib.request

_MANAGER_URL = os.getenv("FRP_MANAGER_URL", "")


def register_proxy(name: str, port: int) -> None:
    if not _MANAGER_URL:
        return
    data = json.dumps({"name": name, "port": port}).encode()
    req = urllib.request.Request(
        f"{_MANAGER_URL}/proxy", data=data,
        headers={"Content-Type": "application/json"},
    )
    try:
        urllib.request.urlopen(req, timeout=5)
    except Exception:
        pass


def unregister_proxy(name: str) -> None:
    if not _MANAGER_URL:
        return
    req = urllib.request.Request(
        f"{_MANAGER_URL}/proxy/{name}", method="DELETE",
    )
    try:
        urllib.request.urlopen(req, timeout=5)
    except Exception:
        pass

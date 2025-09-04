import json
import os
import time
from typing import Any, Dict, List


def tasks_dir(project_root: str) -> str:
    path = os.path.join(project_root, "companion", "tasks")
    os.makedirs(path, exist_ok=True)
    return path


def save_task(project_root: str, task: Dict[str, Any]) -> str:
    ts = time.strftime("%Y%m%d-%H%M%S")
    name = f"task_{ts}.json"
    path = os.path.join(tasks_dir(project_root), name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(task, f, ensure_ascii=False, indent=2)
    return path


def load_task(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def list_tasks(project_root: str) -> List[str]:
    td = tasks_dir(project_root)
    return sorted(
        [os.path.join(td, f) for f in os.listdir(td) if f.lower().endswith(".json")]
    )

import json
import os
import shutil
import time
from typing import Any, Dict, List, Tuple


def load_json(path: str) -> Any:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path: str, data: Any) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def backup_with_timestamp(path: str) -> str:
    base, ext = os.path.splitext(path)
    ts = time.strftime("%Y%m%d-%H%M%S")
    backup = f"{base}.{ts}.backup{ext}"
    shutil.copy2(path, backup)
    return backup


def load_nodes(nodes_path: str) -> List[Dict[str, Any]]:
    data = load_json(nodes_path)
    if not isinstance(data, list):
        raise ValueError("nodesData.json must be a JSON array of node objects")
    return data


def infer_schema(nodes: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Infer a permissive schema by union of keys and example types from sample nodes."""
    keys = {}
    for node in nodes:
        if not isinstance(node, dict):
            continue
        for k, v in node.items():
            t = type(v).__name__
            # Keep the first seen example type; this is just informative
            keys.setdefault(k, t)
    return keys


def ensure_tasks_dir(project_root: str) -> str:
    tasks_dir = os.path.join(project_root, "companion", "tasks")
    os.makedirs(tasks_dir, exist_ok=True)
    return tasks_dir


def next_numeric_id(nodes: List[Dict[str, Any]], node_type: str) -> str:
    """Generate the next id like 'band_123' or 'member_45' based on existing."""
    prefix = f"{node_type}_"
    max_n = 0
    for n in nodes:
        nid = n.get("id")
        if isinstance(nid, str) and nid.startswith(prefix):
            try:
                num = int(nid.split("_")[1])
                max_n = max(max_n, num)
            except Exception:
                continue
    return f"{prefix}{max_n + 1}"


def deep_merge_fill_missing(dst: Dict[str, Any], src: Dict[str, Any]) -> Dict[str, Any]:
    """Merge src into dst by ONLY filling missing/empty fields in dst.
    Arrays are dedup-merged. Nested dicts merge recursively. Scalars fill only if dst is None/empty/"".
    """
    def is_empty_scalar(x: Any) -> bool:
        return x is None or (isinstance(x, str) and x.strip() == "")

    for k, v in src.items():
        if k not in dst:
            dst[k] = v
            continue
        dv = dst.get(k)
        if isinstance(dv, dict) and isinstance(v, dict):
            deep_merge_fill_missing(dv, v)
        elif isinstance(dv, list) and isinstance(v, list):
            # dedupe while keeping order
            seen = set()
            merged = []
            for item in list(dv) + list(v):
                key = json.dumps(item, sort_keys=True, ensure_ascii=False) if isinstance(item, (dict, list)) else item
                if key not in seen:
                    seen.add(key)
                    merged.append(item)
            dst[k] = merged
        else:
            if is_empty_scalar(dv):
                dst[k] = v
            # else keep existing dv
    return dst


def index_by_name_aliases(nodes: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    index: Dict[str, Dict[str, Any]] = {}
    for n in nodes:
        name = n.get("name")
        if isinstance(name, str) and name:
            index[name.lower()] = n
        aliases = n.get("aliases") or []
        if isinstance(aliases, list):
            for a in aliases:
                if isinstance(a, str) and a:
                    index.setdefault(a.lower(), n)
    return index


def apply_task_to_nodes(
    nodes: List[Dict[str, Any]],
    task_nodes: List[Dict[str, Any]],
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Apply a set of task nodes to existing nodes, filling missing fields only.
    Returns (updated_nodes, audit_log_entries)
    """
    idx = index_by_name_aliases(nodes)
    audit: List[Dict[str, Any]] = []

    for new_node in task_nodes:
        target = None
        # Try by explicit id
        nid = new_node.get("id")
        if nid:
            target = next((n for n in nodes if n.get("id") == nid), None)
        # Else match by name/aliases
        if target is None:
            keys = []
            nm = new_node.get("name")
            if isinstance(nm, str) and nm:
                keys.append(nm.lower())
            als = new_node.get("aliases") or []
            if isinstance(als, list):
                keys.extend(a.lower() for a in als if isinstance(a, str) and a)
            for k in keys:
                if k in idx:
                    target = idx[k]
                    break

        if target is None:
            # Create a new node; require a type
            ntype = new_node.get("type")
            if ntype not in ("band", "member", "tag"):
                # default to 'member' if unspecified
                ntype = "member"
            new_id = next_numeric_id(nodes, ntype)
            created = dict(new_node)
            created["id"] = new_id
            nodes.append(created)
            # update index
            nm = created.get("name")
            if isinstance(nm, str) and nm:
                idx[nm.lower()] = created
            for a in created.get("aliases", []) or []:
                if isinstance(a, str) and a:
                    idx.setdefault(a.lower(), created)
            audit.append({"action": "create", "id": new_id, "name": created.get("name")})
        else:
            before = json.loads(json.dumps(target, ensure_ascii=False))
            deep_merge_fill_missing(target, new_node)
            audit.append({
                "action": "merge",
                "id": target.get("id"),
                "name": target.get("name"),
            })

    return nodes, audit

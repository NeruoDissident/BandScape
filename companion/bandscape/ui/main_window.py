import json
import os
from typing import Any, Dict, List, Optional

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QComboBox,
    QFileDialog,
    QHBoxLayout,
    QLabel,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QPlainTextEdit,
    QSplitter,
    QStatusBar,
    QVBoxLayout,
    QWidget,
)

from ..schema import (
    apply_task_to_nodes,
    backup_with_timestamp,
    infer_schema,
    load_nodes,
    save_json,
)
from ..gemini_client import GeminiClient
from ..parsers import parse_any
from .theme import Theme, apply_palette
from ..tasks import save_task


class MainWindow(QMainWindow):
    def __init__(self, project_root: str, nodes_path: str, links_path: str, parent: Optional[QWidget] = None) -> None:
        super().__init__(parent)
        self.setWindowTitle("BandScape Companion")
        self.resize(1200, 800)

        self.project_root = project_root
        self.nodes_path = nodes_path
        self.links_path = links_path

        # Theme
        apply_palette(self, Theme())

        # Top controls
        top = QWidget(self)
        top_layout = QHBoxLayout(top)

        self.file_label = QLabel("No file selected")
        self.btn_select = QPushButton("Select File")
        self.btn_select.clicked.connect(self.on_select_file)

        self.btn_data_correction = QPushButton("Data Correction")
        self.btn_data_correction.clicked.connect(self.on_data_correction)
        self.btn_apply_task = QPushButton("Apply Task")
        self.btn_apply_task.clicked.connect(self.on_apply_task)
        self.btn_save_task = QPushButton("Save Task")
        self.btn_save_task.clicked.connect(self.on_save_task)
        self.btn_apply = QPushButton("Apply to BandScape")
        self.btn_apply.clicked.connect(self.on_apply)

        top_layout.addWidget(self.file_label, 1)
        top_layout.addWidget(self.btn_select)
        top_layout.addWidget(self.btn_data_correction)
        top_layout.addWidget(self.btn_apply_task)
        top_layout.addWidget(self.btn_save_task)
        top_layout.addWidget(self.btn_apply)

        # Splitter with two previews
        self.left_preview = QPlainTextEdit(self)
        self.left_preview.setPlaceholderText("Raw file preview...")
        self.right_preview = QPlainTextEdit(self)
        self.right_preview.setPlaceholderText("Task / output preview...")
        self.right_preview.setReadOnly(False)

        splitter = QSplitter(Qt.Horizontal)
        splitter.addWidget(self.left_preview)
        splitter.addWidget(self.right_preview)
        splitter.setSizes([600, 600])

        # Status bar
        self.status = QStatusBar(self)
        self.setStatusBar(self.status)

        # Main layout
        central = QWidget(self)
        layout = QVBoxLayout(central)
        layout.addWidget(top)
        layout.addWidget(splitter)
        self.setCentralWidget(central)

        # Data
        try:
            self.nodes_cache = load_nodes(self.nodes_path)
            self.schema_hint = infer_schema(self.nodes_cache)
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Failed to load nodesData.json: {e}")
            self.nodes_cache = []
            self.schema_hint = {}

        self.selected_file: Optional[str] = None
        self.generated_task: Optional[Dict[str, Any]] = None

        self.gemini = GeminiClient()
        if not self.gemini.enabled:
            self.status.showMessage("Gemini not configured (.env GEMINI_API_KEY). Using fallback heuristics.")

    # UI Actions
    def on_select_file(self) -> None:
        path, _ = QFileDialog.getOpenFileName(self, "Select raw data file", self.project_root, "All Files (*.*)")
        if not path:
            return
        self.selected_file = path
        self.file_label.setText(os.path.basename(path))
        parsed = parse_any(path)
        text = parsed.get("text") or json.dumps(parsed.get("data"), ensure_ascii=False, indent=2) if parsed.get("data") is not None else ""
        self.left_preview.setPlainText(text or "")
        self.right_preview.setPlainText("")
        self.status.showMessage(f"Loaded {path}")

    def on_data_correction(self) -> None:
        if not self.selected_file:
            QMessageBox.information(self, "Info", "Select a file first.")
            return
        # Re-parse to get text
        parsed = parse_any(self.selected_file)
        text = parsed.get("text") or ""

        # Try Gemini first
        nodes: List[Dict[str, Any]] = []
        if self.gemini.enabled:
            nodes = self.gemini.extract_nodes_from_text(text, self.schema_hint)
        # Fallbacks: if file already contains JSON nodes, use them
        if not nodes and parsed.get("kind") == "json":
            data = parsed.get("data")
            if isinstance(data, dict) and isinstance(data.get("nodes"), list):
                nodes = [x for x in data.get("nodes", []) if isinstance(x, dict)]
            elif isinstance(data, list):
                nodes = [x for x in data if isinstance(x, dict)]

        if not nodes:
            # Minimal skeleton to allow manual editing
            nodes = [{"type": "member", "name": "", "aliases": [], "description": ""}]

        task = {
            "source_file": self.selected_file,
            "created_at": __import__("time").strftime("%Y-%m-%d %H:%M:%S"),
            "nodes": nodes,
        }
        self.generated_task = task
        self.right_preview.setPlainText(json.dumps(task, ensure_ascii=False, indent=2))
        self.status.showMessage("Task generated. You can edit the JSON on the right before applying.")

    def on_apply_task(self) -> None:
        if not self.generated_task:
            # Attempt to read JSON from right preview
            try:
                data = json.loads(self.right_preview.toPlainText())
                if isinstance(data, dict) and isinstance(data.get("nodes"), list):
                    self.generated_task = data
                else:
                    raise ValueError("Right pane does not contain a valid task JSON with 'nodes' array")
            except Exception as e:
                QMessageBox.warning(self, "Warning", f"No task to apply: {e}")
                return

        task_nodes = [x for x in self.generated_task.get("nodes", []) if isinstance(x, dict)]
        updated, audit = apply_task_to_nodes(self.nodes_cache, task_nodes)
        self.nodes_cache = updated
        summary = {
            "applied": len(task_nodes),
            "audit": audit[:50],  # cap in preview
            "total_nodes": len(self.nodes_cache),
        }
        self.status.showMessage("Task applied to in-memory nodes. Click 'Apply to BandScape' to save.")
        self.right_preview.setPlainText(json.dumps({"task": self.generated_task, "result": summary}, ensure_ascii=False, indent=2))

    def on_apply(self) -> None:
        try:
            # Backup then save
            if os.path.exists(self.nodes_path):
                backup_with_timestamp(self.nodes_path)
            save_json(self.nodes_path, self.nodes_cache)
            self.status.showMessage(f"Saved updates to {self.nodes_path}")
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Failed to save nodes: {e}")

    def on_save_task(self) -> None:
        """Persist the current task JSON into companion/tasks/ for auditing and later reuse."""
        task: Optional[Dict[str, Any]] = None
        if self.generated_task:
            task = self.generated_task
        else:
            # Try to parse from right pane
            try:
                data = json.loads(self.right_preview.toPlainText())
                if isinstance(data, dict) and isinstance(data.get("nodes"), list):
                    task = data
            except Exception:
                pass
        if not task:
            QMessageBox.information(self, "Info", "No valid task found to save (expecting an object with a 'nodes' array).")
            return
        try:
            path = save_task(self.project_root, task)
            self.status.showMessage(f"Task saved: {path}")
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Failed to save task: {e}")

import os
import sys
from dotenv import load_dotenv
from PySide6.QtWidgets import QApplication
from bandscape.ui.main_window import MainWindow


def resolve_project_root() -> str:
    """Return absolute path of BandScape project root (one level up from companion)."""
    return os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def main() -> None:
    # Load environment (e.g., GEMINI_API_KEY)
    load_dotenv()

    app = QApplication(sys.argv)

    project_root = resolve_project_root()
    public_dir = os.path.join(project_root, "public")
    nodes_path = os.path.join(public_dir, "nodesData.json")
    links_path = os.path.join(public_dir, "linksData.json")

    window = MainWindow(project_root=project_root, nodes_path=nodes_path, links_path=links_path)
    window.show()

    sys.exit(app.exec())


if __name__ == "__main__":
    main()

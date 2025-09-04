from dataclasses import dataclass


@dataclass
class Theme:
    # Placeholder colors; to be updated after screenshot reference
    bg: str = "#0f0f17"
    panel: str = "#161625"
    text: str = "#eaeaf2"
    accent: str = "#7aa2f7"
    accent2: str = "#9ece6a"


def apply_palette(app, theme: Theme) -> None:
    palette = app.palette()
    # We keep it simple; detailed palette can be added later
    app.setStyleSheet(
        f"""
        QMainWindow {{ background: {theme.bg}; color: {theme.text}; }}
        QPlainTextEdit, QTextEdit {{ background: {theme.panel}; color: {theme.text}; border: 1px solid #333; }}
        QPushButton {{ background: {theme.accent}; color: #000; padding: 6px 10px; border-radius: 4px; }}
        QPushButton:disabled {{ background: #555; color: #999; }}
        QComboBox {{ background: {theme.panel}; color: {theme.text}; padding: 4px; }}
        QStatusBar {{ background: {theme.panel}; color: {theme.text}; }}
        QLabel {{ color: {theme.text}; }}
        """
    )

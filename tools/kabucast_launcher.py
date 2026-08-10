"""Opens the offline page in the default browser.

The whole tool is one HTML file, so the executable exists only to carry that
file and hand it to a browser. It copies the page out of its own bundle before
opening it, because a one-file PyInstaller build deletes its extraction
directory as soon as the process exits and the browser would find nothing.
"""

import os
import shutil
import sys
import tempfile
import webbrowser
from pathlib import Path

PAGE_NAME = "kabucast-offline.html"


def bundled_page() -> Path:
    """The page inside the bundle, or beside this file when run from source."""
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return Path(base) / PAGE_NAME


def main() -> int:
    source = bundled_page()
    if not source.is_file():
        print(f"missing {PAGE_NAME} next to the executable", file=sys.stderr)
        return 1

    target_directory = Path(tempfile.gettempdir()) / "kabucast"
    target_directory.mkdir(parents=True, exist_ok=True)
    target = target_directory / PAGE_NAME
    shutil.copyfile(source, target)

    # as_uri percent-encodes spaces, which a path like "Program Files" needs.
    webbrowser.open(target.as_uri())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

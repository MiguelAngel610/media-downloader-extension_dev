"""Native messaging host entry point (registered with Chrome through host.bat).

The path of this file is part of the Chrome registration, so it stays stable;
all the logic lives in the md_host package next to it (see md_host/__init__.py).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from md_host.app import main  # noqa: E402  (import after the sys.path setup above)

if __name__ == "__main__":
    main()

"""Create a portable source bundle, excluding host identity and generated archives."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
destination = root / "dist/download/loglens-source.zip"
destination.parent.mkdir(exist_ok=True)
excluded = {".git", ".openai", ".venv", "__pycache__", ".pytest_cache", "node_modules", "download"}
with ZipFile(destination, "w", ZIP_DEFLATED) as archive:
    for path in sorted(root.rglob("*")):
        rel = path.relative_to(root)
        if path.is_file() and not any(part in excluded for part in rel.parts) and path.name not in {".env", "secrets.toml"} and not path.name.endswith(".pyc"):
            archive.write(path, "loglens/" + rel.as_posix())
print(destination)

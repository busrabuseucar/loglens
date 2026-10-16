"""Build a portable source archive using explicit source paths and file types."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT_FILES = {'README.md', 'LICENSE', 'app.py', 'requirements.txt', 'package.json',
              'package-lock.json', 'playwright.config.mjs', '.gitignore'}
DIRECTORIES = {'loglens', 'dist', 'tests', 'scripts', 'docs', '.github'}
EXTENSIONS = {'.py', '.js', '.mjs', '.html', '.css', '.svg', '.csv', '.md', '.yml', '.yaml'}
EXCLUDED = {'download', '__pycache__', 'test-results', 'playwright-report', 'node_modules', '.git'}

def build_archive(root):
    destination = root / 'dist/download/loglens-source.zip'
    destination.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(destination, 'w', ZIP_DEFLATED) as archive:
        for path in sorted(root.rglob('*')):
            rel = path.relative_to(root)
            if not path.is_file() or any(part in EXCLUDED for part in rel.parts):
                continue
            if any(p.is_symlink() for p in [path, *path.parents]):
                continue
            if path.name.startswith('.env') or path.name == 'secrets.toml':
                continue
            if rel.as_posix() in ROOT_FILES or (len(rel.parts) > 1 and rel.parts[0] in DIRECTORIES and path.suffix in EXTENSIONS):
                archive.write(path, 'loglens/' + rel.as_posix())
    return destination

if __name__ == '__main__':
    print(build_archive(Path(__file__).resolve().parents[1]))

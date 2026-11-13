import json, re, sys, pathlib

if len(sys.argv) != 2 or not re.fullmatch(r"\d+\.\d+\.\d+", sys.argv[1]):
    sys.exit("usage: python3 scripts/release.py X.Y.Z")
v = sys.argv[1]
major, minor, patch = (int(x) for x in v.split("."))
code = major * 10000 + minor * 100 + patch
root = pathlib.Path(__file__).resolve().parent.parent

def sub(path, pattern, repl):
    p = root / path
    text = p.read_text(encoding="utf-8")
    new, n = re.subn(pattern, repl, text)
    if not n:
        sys.exit(f"no match in {path}")
    p.write_text(new, encoding="utf-8")

sub("docs/js/config.js", r"version: '[^']*'", f"version: '{v}'")
sub("docs/sw.js", r"const VERSION = '[^']*'", f"const VERSION = '{v}'")
sub("android/app/build.gradle", r'versionName "[^"]*"', f'versionName "{v}"')
sub("android/app/build.gradle", r"versionCode \d+", f"versionCode {code}")
sub("ios/App/App.xcodeproj/project.pbxproj", r"MARKETING_VERSION = [^;]*;", f"MARKETING_VERSION = {v};")
sub("ios/App/App.xcodeproj/project.pbxproj", r"CURRENT_PROJECT_VERSION = [^;]*;", f"CURRENT_PROJECT_VERSION = {code};")
pkg = root / "package.json"
data = json.loads(pkg.read_text(encoding="utf-8"))
data["version"] = v
pkg.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
print(f"version {v} (build {code}) set in web app, offline cache, Android and iPhone")

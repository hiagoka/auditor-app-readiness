#!/usr/bin/env bash
# Clona os repositórios de teste e faz checkout do commit "antes" (onde o problema existe).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SPEC="$ROOT/evaluation/test-repos.json"
DEST="$ROOT/test-repos"
mkdir -p "$DEST"

# Emite: slug \t cloneUrl \t commitBefore
node -e '
const repos = require(process.argv[1]);
for (const r of repos) {
  const slug = r.id + "-" + r.repo.split("/")[1];
  process.stdout.write([slug, r.cloneUrl, r.commitBefore].join("\t") + "\n");
}
' "$SPEC" | while IFS=$'\t' read -r slug url sha; do
  target="$DEST/$slug"

  if [ -d "$target/.git" ]; then
    echo "== $slug: já existe, atualizando"
    git -C "$target" fetch --quiet --tags origin
  else
    echo "== $slug: clonando $url"
    git clone --quiet --filter=blob:none "$url" "$target"
  fi

  if [ "$sha" = "HEAD" ]; then
    echo "   mantendo HEAD (caso sem correção de referência)"
  else
    echo "   checkout $sha"
    git -C "$target" fetch --quiet origin "$sha" 2>/dev/null || true
    if ! git -C "$target" checkout --quiet --detach "$sha" 2>/dev/null; then
      echo "   !! falha no checkout de $sha em $slug — verifique o hash em evaluation/test-repos.json" >&2
    fi
  fi
done

echo
echo "OK — repositórios em $DEST"

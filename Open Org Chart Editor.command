#!/bin/zsh
# Double-click in Finder to start the org chart editor and open it in your browser.
# Close this Terminal window (or press Ctrl+C) to stop the editor.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$(dirname "$0")" || exit 1

if lsof -nP -iTCP:4173 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "The editor is already running - opening it."
  open "http://localhost:4173"
  exit 0
fi

( sleep 1.5; open "http://localhost:4173" ) &
exec node edit.mjs

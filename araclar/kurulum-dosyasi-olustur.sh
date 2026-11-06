#!/usr/bin/env bash
# supabase/kurulum/tek-dosya-kurulum.sql dosyasını migration'lardan yeniden üretir (yeni migration eklenince çalıştırın).
set -euo pipefail
cd "$(dirname "$0")/.."
cikti=supabase/kurulum/tek-dosya-kurulum.sql
bas=$(sed -n '1,/^end \$\$;$/p' "$cikti")
{ printf '%s\n' "$bas"; for f in supabase/migrations/*.sql; do printf '\n\n-- ===================== %s =====================\n' "$(basename "$f")"; cat "$f"; done; } > "$cikti.tmp"
mv "$cikti.tmp" "$cikti"
echo "$cikti güncellendi"

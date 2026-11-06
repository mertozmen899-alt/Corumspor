-- =====================================================================
-- Çorum Taraftar: bildirim gizli ayarları Supabase Vault'ta (022)
-- Sıra: … → 020 → 021 → 022. Tekrar çalıştırılabilir (create or replace). Başka migration'ın nesnesine dokunmaz.
--
-- Edge Function (bildirim-gonder) VAPID anahtarlarını ve gizli başlığı Edge Function secret'ı yerine Vault'tan okur:
--   bildirim_vapid_public   VAPID açık anahtarı (ayar.js VAPID_ACIK_ANAHTAR ile aynı)
--   bildirim_vapid_private  VAPID özel anahtarı
--   bildirim_vapid_subject  mailto:<iletişim e-postası>
--   bildirim_gizli          x-bildirim-anahtari başlığı (021 bildirim_calistir() de aynı sırrı gönderir)
--   (bildirim_url 021'indir: veritabanının pg_net ile çağırdığı Edge Function adresi)
-- Sırlar `node araclar/vapid-olustur.js --sql` çıktısıyla yazılır (README "Bildirimler").
-- bildirim_gizli_ayarlar() yalnız service_role çalıştırır (Edge Function, Supabase'in kendi verdiği anahtarla).
-- Vault yoksa (düz Postgres, test) fonksiyon kurulur ama boş satır döner.
-- =====================================================================

create or replace function public.bildirim_gizli_ayarlar()
returns table (vapid_public text, vapid_private text, vapid_subject text, bildirim_gizli text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if to_regclass('vault.decrypted_secrets') is null then
    return query select null::text, null::text, null::text, null::text;
    return;
  end if;
  return query
    select
      max(s.decrypted_secret) filter (where s.name = 'bildirim_vapid_public'),
      max(s.decrypted_secret) filter (where s.name = 'bildirim_vapid_private'),
      max(s.decrypted_secret) filter (where s.name = 'bildirim_vapid_subject'),
      max(s.decrypted_secret) filter (where s.name = 'bildirim_gizli')
    from vault.decrypted_secrets s
    where s.name in ('bildirim_vapid_public', 'bildirim_vapid_private', 'bildirim_vapid_subject', 'bildirim_gizli');
end;
$$;
revoke all on function public.bildirim_gizli_ayarlar() from public, anon, authenticated;
grant execute on function public.bildirim_gizli_ayarlar() to service_role;
comment on function public.bildirim_gizli_ayarlar() is 'Bildirim VAPID anahtarları + gizli başlık (Vault, 022). Yalnız service_role (bildirim-gonder Edge Function).';

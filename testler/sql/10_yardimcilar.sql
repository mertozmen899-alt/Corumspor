-- SADECE TEST: sonuç tablosu ve doğrulama yardımcıları
create schema test;
create table test.sonuc (no serial primary key, ad text not null, gecti boolean not null, detay text);
grant usage on schema test to anon, authenticated;
grant select, insert on test.sonuc to anon, authenticated;
grant usage on sequence test.sonuc_no_seq to anon, authenticated;

create function test.dogru(ad text, kosul boolean, detay text default null) returns void
language plpgsql as $$
begin
  insert into test.sonuc (ad, gecti, detay) values (ad, coalesce(kosul, false), detay);
end $$;

create function test.esit(ad text, gercek text, beklenen text) returns void
language plpgsql as $$
begin
  insert into test.sonuc (ad, gecti, detay)
  values (ad, gercek is not distinct from beklenen,
          'beklenen=' || coalesce(beklenen, 'NULL') || ' gelen=' || coalesce(gercek, 'NULL'));
end $$;

-- Sorgu hata vermeli (desen verilirse hata mesajı desene uymalı)
create function test.hata_bekle(ad text, sorgu text, desen text default null) returns void
language plpgsql as $$
declare
  m text;
begin
  begin
    execute sorgu;
  exception when others then
    m := sqlerrm;
    insert into test.sonuc (ad, gecti, detay) values (ad, desen is null or m ~* desen, m);
    return;
  end;
  insert into test.sonuc (ad, gecti, detay) values (ad, false, 'hata bekleniyordu, sorgu başarılı oldu');
end $$;

-- Sorguyu çalıştır, etkilenen satır sayısını döndür (RLS sessizce 0 satır bırakır).
-- Beklenmeyen hata olursa -1 döner ve ayrı bir "kalan" kaydı düşer; testler durmaz.
create function test.satir(sorgu text) returns int
language plpgsql as $$
declare
  n int;
begin
  execute sorgu;
  get diagnostics n = row_count;
  return n;
exception when others then
  insert into test.sonuc (ad, gecti, detay) values ('beklenmeyen hata', false, sqlerrm || ' | ' || sorgu);
  return -1;
end $$;

grant execute on all functions in schema test to anon, authenticated;

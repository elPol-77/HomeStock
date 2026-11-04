import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const db = new PGlite();
const sql = fs.readFileSync(new URL('../migrations/0001_homestock.sql', import.meta.url), 'utf8');
await db.exec(`
  create role anon; create role authenticated;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create publication supabase_realtime;
  grant usage on schema public to authenticated; grant usage on schema auth to authenticated;
  alter default privileges in schema public grant all on tables to authenticated;
`);
await db.exec(sql);
await db.exec(sql); // idempotente
console.log('migración OK (x2)');
const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222', C = '33333333-3333-3333-3333-333333333333';
const H = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
await db.exec(`insert into auth.users values ('${A}','ana@x.es','{"display_name":"Ana"}'),('${B}','bea@x.es','{}'),('${C}','carlos@x.es','{}')`);
await db.exec(`grant all on all tables in schema public to authenticated; grant execute on all functions in schema public to authenticated;`);
const as = async (uid, q) => { await db.exec(`reset role; set request.jwt.claim.sub = '${uid}'; set role authenticated;`); return db.query(q); };
await as(A, `select public.create_household('${H}', 'Casa de Ana')`);
const code = (await as(A, `select invite_code from households`)).rows[0].invite_code;
console.log('código', code);
const ins = (uid, id) => as(uid, `insert into products (id, household_id, created_at, updated_at, name) values ('${id}', '${H}', '2026-11-04T10:00:00.000Z', '2026-11-04T10:00:00.000Z', 'Leche')`);
await ins(A, '00000000-0000-0000-0000-000000000001');
// B todavía no es miembro: no ve nada y no puede insertar
console.log('B ve antes de unirse:', (await as(B, 'select count(*)::int n from products')).rows[0].n);
try { await ins(B, '00000000-0000-0000-0000-000000000002'); console.log('ERROR: B insertó sin ser miembro'); } catch (e) { console.log('B bloqueado OK:', e.message.slice(0, 60)); }
console.log('join:', (await as(B, `select * from public.join_household('${code.toLowerCase()}')`)).rows);
console.log('B ve tras unirse:', (await as(B, 'select count(*)::int n from products')).rows[0].n);
await ins(B, '00000000-0000-0000-0000-000000000003');
const r = (await as(A, `select name, created_by, server_updated_at is not null t from products order by server_updated_at`)).rows; console.log(r);
console.log('C (externo) ve:', (await as(C, 'select count(*)::int n from products')).rows[0].n, 'hogares:', (await as(C, 'select count(*)::int n from households')).rows[0].n);
try { await as(B, `update households set invite_code='HACK' where id='${H}'`); console.log('filas B update (debe ser 0 por RLS):'); } catch (e) { console.log('B update hogar bloqueado:', e.message.slice(0,60)); }
try { await as(A, `update households set invite_code='HACK' where id='${H}'`); console.log('ERROR: admin cambió código directamente'); } catch (e) { console.log('cambio directo de código bloqueado OK'); }
console.log('nuevo código:', (await as(A, `select public.regenerate_invite_code('${H}') c`)).rows[0].c);
try { await as(B, `select public.set_member_role('${H}', '${B}', 'admin')`); console.log('ERROR'); } catch (e) { console.log('B no puede hacerse admin OK'); }
try { await as(A, `select public.remove_member('${H}', '${A}')`); console.log('ERROR'); } catch (e) { console.log('último admin no puede irse OK'); }
await as(A, `select public.set_member_role('${H}', '${B}', 'admin')`);
console.log('miembros:', (await as(A, `select user_id, role, display_name from household_members order by joined_at`)).rows);
await as(B, `select public.delete_my_account()`);
console.log('tras borrar cuenta B, miembros:', (await as(A, 'select count(*)::int n from household_members')).rows[0].n, 'usuarios:', (await (async()=>{await db.exec('reset role'); return db.query('select count(*)::int n from auth.users')})()).rows[0].n);

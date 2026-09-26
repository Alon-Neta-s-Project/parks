-- Emits the GRANT statements that reproduce a database's privileges in schema public,
-- read from the catalog (relacl / attacl / proacl). Readable by any role — including
-- reviewer_readonly, which cannot read most of the tables themselves.
--
-- ⚠️ Owners are skipped: an owner's privileges are implicit, and the baseline is
-- applied by the role that will own everything.
with rel as (
  select c.oid, c.relname, c.relkind, c.relowner, c.relacl
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r','p','v','m','S')
),
who as (select 0::oid as oid, 'public' as name union all select oid, quote_ident(rolname) from pg_roles)
select stmt from (
  -- tables, views, sequences
  select 1 as ord, r.relname as obj, w.name as g,
         format('grant %s on %s public.%I to %s%s;',
                string_agg(a.privilege_type, ', ' order by a.privilege_type),
                case when r.relkind = 'S' then 'sequence' else 'table' end,
                r.relname, w.name,
                case when bool_or(a.is_grantable) then ' with grant option' else '' end) as stmt
    from rel r, aclexplode(r.relacl) a join who w on w.oid = a.grantee
   where a.grantee <> r.relowner
   group by r.relname, r.relkind, w.name
  union all
  -- columns
  select 2, c.relname||'.'||at.attname, w.name,
         format('grant %s (%I) on table public.%I to %s;', a.privilege_type, at.attname, c.relname, w.name)
    from rel c join pg_attribute at on at.attrelid = c.oid and at.attacl is not null,
         aclexplode(at.attacl) a join who w on w.oid = a.grantee
   where a.grantee <> c.relowner
  union all
  -- functions: a NULL proacl means the default, EXECUTE to PUBLIC
  select 3, p.proname, w.name,
         format('grant execute on function public.%I(%s) to %s;', p.proname,
                pg_get_function_identity_arguments(p.oid), w.name)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
         aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a join who w on w.oid = a.grantee
   where n.nspname = 'public' and p.prokind = 'f' and a.grantee <> p.proowner
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
) s
order by ord, obj, g;

-- One line per object in schema public, normalized so two databases can be diffed.
--   psql "<url>" -At -f scripts/baseline/fingerprint.sql > out.txt
--
-- ⚠️ **Normalized on purpose, and only where the difference is not real:**
--   • search_path is fixed, so a type prints the same whether or not `extensions`
--     is on the session's path (the first run showed vector vs extensions.vector).
--   • function bodies are compared without comments and whitespace — production
--     got two functions pasted without their comments; the logic is identical.
-- Anything else that differs, differs.
set search_path = public;

select 'table    '||c.relname||' kind='||c.relkind::text||' rls='||c.relrowsecurity||' force='||c.relforcerowsecurity
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind in ('r','p','v','m','S')
union all
select 'column   '||c.relname||'.'||a.attname||' '||format_type(a.atttypid,a.atttypmod)
       ||case when a.attnotnull then ' not null' else '' end
       ||coalesce(' default '||pg_get_expr(d.adbin,d.adrelid),'')
  from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
  left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
 where n.nspname='public' and c.relkind in ('r','p','v','m') and a.attnum>0 and not a.attisdropped
union all
select 'constr   '||c.relname||'.'||k.conname||' '||pg_get_constraintdef(k.oid)
  from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public'
union all
select 'index    '||c.relname||' '||regexp_replace(pg_get_indexdef(i.indexrelid),'^.* USING ','USING ')
  from pg_index i join pg_class c on c.oid=i.indrelid join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public'
union all
select 'view     '||c.relname||' md5='||md5(regexp_replace(pg_get_viewdef(c.oid), '\s+', '', 'g'))
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind in ('v','m')
union all
select 'function '||p.proname||'('||pg_get_function_identity_arguments(p.oid)||') → '||pg_get_function_result(p.oid)
       ||' definer='||p.prosecdef||' '||coalesce(array_to_string(p.proconfig,','),'')
       ||' body='||md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g'))
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prokind='f'
   and not exists (select 1 from pg_depend dp where dp.objid=p.oid and dp.deptype='e')
union all
select 'policy   '||tablename||'.'||policyname||' '||permissive::text||' '||cmd::text||' to '||array_to_string(roles,',')
       ||' using '||coalesce(qual,'-')||' check '||coalesce(with_check,'-')
  from pg_policies where schemaname='public'
union all
select 'trigger  '||c.relname||'.'||t.tgname||' '||regexp_replace(pg_get_triggerdef(t.oid),'^.* ON ','ON ')
  from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and not t.tgisinternal
union all
-- privileges, from the ACLs themselves (owners' implicit rights excluded)
select 'acl      '||c.relname||' '||coalesce(r.rolname,'PUBLIC')||' '||string_agg(a.privilege_type, ',' order by a.privilege_type)
  from pg_class c join pg_namespace n on n.oid=c.relnamespace, aclexplode(c.relacl) a
  left join pg_roles r on r.oid=a.grantee
 where n.nspname='public' and c.relkind in ('r','p','v','m','S') and a.grantee<>c.relowner
 group by c.relname, r.rolname
union all
select 'colacl   '||c.relname||'.'||at.attname||' '||coalesce(r.rolname,'PUBLIC')||' '||a.privilege_type
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  join pg_attribute at on at.attrelid=c.oid and at.attacl is not null, aclexplode(at.attacl) a
  left join pg_roles r on r.oid=a.grantee
 where n.nspname='public' and a.grantee<>c.relowner
union all
select 'execute  '||p.proname||'('||pg_get_function_identity_arguments(p.oid)||') '||coalesce(r.rolname,'PUBLIC')
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace,
       aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  left join pg_roles r on r.oid=a.grantee
 where n.nspname='public' and p.prokind='f' and a.grantee<>p.proowner
   and not exists (select 1 from pg_depend dp where dp.objid=p.oid and dp.deptype='e')
order by 1;

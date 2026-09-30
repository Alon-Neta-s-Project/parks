-- ════════════════════════════════════════════════════════════════════
-- match_knowledge moves to the server — the database function is dropped
-- ════════════════════════════════════════════════════════════════════
--
-- The query now lives in apps/server/src/db/match-knowledge.ts, a copy of the
-- function's body (local parity: 2512/2512 inputs identical, and a rolled-back
-- fixture shows neither side returns an unapproved document or chunk). Tim on
-- Netlify runs it when the site has DATABASE_URL, and never calls the function.
--
-- 🔴 **Not for production before the cut-over.** Production's Tim still runs on
-- Supabase Edge and calls the function over RPC; dropping it there first breaks
-- retrieval. Staging only, like 20260930170000. Production runs migrations only
-- through migrate.yml, behind its approval gate (O2).
--
-- ⚠️ Team 1's verifier was to check retrieval through this function, once Guy
-- approved a grant for team1_content (team1-publish.yml). That grant was never
-- written; the check now belongs to the server's query.
--
-- down restores the function and its grants exactly as the baseline has them.

-- migrate:up
drop function public.match_knowledge(text, integer, text);

-- migrate:down
CREATE FUNCTION public.match_knowledge(p_embedding text, p_limit integer DEFAULT 5, p_resort text DEFAULT NULL::text) RETURNS TABLE(chunk_id uuid, doc_id text, title text, content text, authority_tier public.authority_tier, volatility public.volatility_tier, last_verified date, similarity double precision)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
  select
    c.id,
    d.id,
    d.title,
    c.content,
    c.authority_tier,
    d.volatility,
    d.last_verified,
    -- <=> הוא מרחק קוסינוס: 0 זהה, 2 הפוך. ההמרה לדמיון היא כדי
    -- שהמספר שיוצא מכאן יגדל ככל שהקטע רלוונטי יותר, ולא להפך.
    1 - (c.embedding <=> p_embedding::vector) as similarity
  from knowledge_chunk c
  join knowledge_doc d on d.id = c.doc_id
  where c.embedding is not null
    -- ⚠️ תוכן שלא אושר אינו נשלף. הכלל קיים ב-RLS, אבל הפונקציה הזו היא
    -- security definer ולכן עוקפת אותו — ומה שנאכף במקום אחד ולא כאן
    -- היה נכנס לתשובה של טים דרך הדלת הזו.
    and c.review_status = 'approved'
    and d.review_status = 'approved'
    and (p_resort is null or d.scope_resort = p_resort)
  order by c.embedding <=> p_embedding::vector
  -- ⚠️ הגג נחתך כאן ואינו מתקבל מהקוראת (הלקח מ-026). חמישה קטעים הם
  -- מה שנכנס להקשר; מאה היו מנפחים את הקלט ואת העלות בלי לשפר תשובה.
  limit least(coalesce(p_limit, 5), 20)
$$;

-- A new function is executable by PUBLIC; the baseline revokes that before it grants.
revoke all on function public.match_knowledge(p_embedding text, p_limit integer, p_resort text) from public;
grant execute on function public.match_knowledge(p_embedding text, p_limit integer, p_resort text) to anon;
grant execute on function public.match_knowledge(p_embedding text, p_limit integer, p_resort text) to authenticated;
grant execute on function public.match_knowledge(p_embedding text, p_limit integer, p_resort text) to service_role;

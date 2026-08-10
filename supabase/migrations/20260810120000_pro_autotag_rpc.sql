-- 模式二规则升级(业务方 2026-08-10 定):
-- **出现在新 Eastwind(PRO 账号)看板上的骑手 = PRO 骑手,默认标记,不再人工维护。**
--
-- 实现:PRO 抓取器每批入库时,把这批骑手的档案 pool 批量置为 'pro'。
-- 放在数据库端一条 UPDATE 里做,而不是应用端读改写,原因是 7/21 事故:
-- 持有过期 riders 内存视图的实例做写回,把新鲜的加盟商归属冲掉了。
-- 本函数按 99 ID 定点改 pool 一个字段,不创建档案、不整表写回,无那类风险。
--
-- 幂等:已是 pro 的行不动;返回本次实际改动的行数(0 = 全部已标好)。
-- 就算哪天被旧数据覆盖回 standard,下一批(3 分钟内)会自动纠正。

CREATE OR REPLACE FUNCTION eastwind_autotag_pro(p_ext_ids text[])
RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH upd AS (
    UPDATE app_state_records
    SET data = jsonb_set(data, '{pool}', '"pro"'),
        updated_at = now()
    WHERE collection = 'riders'
      AND data->>'ninetyNineId' = ANY(p_ext_ids)
      AND coalesce(data->>'pool', '') <> 'pro'
    RETURNING 1
  )
  SELECT coalesce(count(*), 0)::int FROM upd;
$$;

REVOKE EXECUTE ON FUNCTION eastwind_autotag_pro(text[]) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION eastwind_autotag_pro(text[]) TO service_role;

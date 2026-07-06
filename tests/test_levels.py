from datetime import date
import psycopg2
from collector.db import upsert_counts, upsert_manual_input


def _seed_p03(pg_url):
    """Platform-Team Q1: full-pass project -> A..E all 4, overall 4."""
    months = [("2026-01", date(2026,1,1), date(2026,1,31)),
              ("2026-02", date(2026,2,1), date(2026,2,28)),
              ("2026-03", date(2026,3,1), date(2026,3,31))]
    raw = [  # ai_users, ai_prs, total_prs, agent_tasks, total_tasks, autonomous, human_fixed, agent_total, agent_merged, deploys, weeks, incidents, mttr, lead, rework, reviewed
        (18,55,100,40,120,18,12,30,32,8,4,1,3,30,6,55),
        (19,60,100,45,120,20,13,33,36,10,4,1,2.5,24,5,60),
        (20,65,110,50,130,24,14,38,42,12,4,1,2,20,4,65)]
    for (pk,s,e),(au,aip,tp,at,tt,aut,hf,agt,agm,dep,wk,inc,mt,ld,rw,rev) in zip(months,raw):
        upsert_counts(pg_url,"P03","month",pk,s,e,{
            "ai_users_weekly_avg":au,"ai_prs":aip,"total_prs":tp,"agent_tasks":at,"total_tasks":tt,
            "agent_prs_autonomous":aut,"agent_prs_human_fixed":hf,"agent_prs_total":agt,"agent_prs_merged":agm,
            "deploys":dep,"weeks":wk,"incidents":inc,"mttr_h":mt,"lead_time_h":ld,
            "rework_prs":rw,"ai_prs_reviewed":rev})
        upsert_manual_input(pg_url,"P03",pk,"total_engineers","20","seed")
        upsert_manual_input(pg_url,"P03",pk,"cost_baseline","45","seed")
    q="2026-Q1"
    for f in ["g1_agents_md","g2_ai_policy","g3_required_review","g4_eval_suite","g5_shared_library",
              "a2_dashboard","b4_dora_improving","b5_cost_multi_wf","b6_business_outcomes",
              "c4_ai_vs_nonai","c5_evals","c6_sast_pii_required","d3_defined_class","d4_cycle_measured"]:
        upsert_manual_input(pg_url,"P03",q,f,"Yes","seed")


def test_quarter_metrics_aggregates_and_flags(pg_url):
    _seed_p03(pg_url)
    with psycopg2.connect(pg_url) as conn, conn.cursor() as cur:
        cur.execute("SELECT b1, b2, b3, d1, d2, gov_score, "
                    "round(autonomy_frac::numeric,3) FROM reporting.v_quarter_metrics "
                    "WHERE project='P03' AND quarter='2026-Q1'")
        b1,b2,b3,d1,d2,gov,aut = cur.fetchone()
    assert b1 and b2 and b3 and d1 and d2
    assert gov == 5           # G1..G5 = Yes
    assert float(aut) > 0.30  # autonomous/agent_total averaged


def test_p03_full_pass_levels(pg_url):
    _seed_p03(pg_url)
    with psycopg2.connect(pg_url) as conn, conn.cursor() as cur:
        cur.execute("SELECT lvl_a,lvl_b,lvl_c,lvl_d,lvl_e,overall FROM reporting.v_levels "
                    "WHERE project='P03' AND quarter='2026-Q1'")
        assert list(cur.fetchone()) == [4, 4, 4, 4, 4, 4]

#!/usr/bin/env python3
"""
Export all hackathon DB tables to a single Excel workbook.

Dependencies:
    pip3 install psycopg2-binary openpyxl pandas

Usage:
    python3 export_excel.py                     # → datasets/output/hackathon_dataset.xlsx
    python3 export_excel.py my_output.xlsx      # custom filename
"""
import sys
import re
import psycopg2
import pandas as pd
from pathlib import Path

DB = dict(host="localhost", port=55432, dbname="hackathon", user="postgres", password="postgres")
SCHEMAS = ("core", "pmo", "ta", "elc", "lnd")
SCRIPT_DIR = Path(__file__).parent
DEFAULT_OUT = SCRIPT_DIR / "../datasets/output/hackathon_dataset.xlsx"
OUT = sys.argv[1] if len(sys.argv) > 1 else str(DEFAULT_OUT)


def sheet_name(schema: str, table: str) -> str:
    name = f"{schema}__{table}"
    return re.sub(r'[\\/*?:\[\]]', '', name)[:31]


def fetch_table(cur, schema: str, table: str) -> pd.DataFrame:
    cur.execute(f'SELECT * FROM "{schema}"."{table}"')
    cols = [d[0] for d in cur.description]
    df = pd.DataFrame(cur.fetchall(), columns=cols)
    for col in df.select_dtypes(include=["datetimetz"]).columns:
        df[col] = df[col].dt.tz_localize(None)
    return df


def fetch_schemas(cur, tables: list) -> pd.DataFrame:
    cur.execute("""
        SELECT
            c.table_schema   AS schema,
            c.table_name     AS table,
            c.column_name    AS column,
            c.data_type      AS type,
            CASE WHEN c.is_nullable = 'YES' THEN '' ELSE 'NOT NULL' END AS nullable,
            COALESCE(
                (SELECT 'PK'
                 FROM information_schema.table_constraints tc
                 JOIN information_schema.key_column_usage kcu
                   ON tc.constraint_name = kcu.constraint_name
                  AND tc.table_schema = kcu.table_schema
                  AND tc.table_name = kcu.table_name
                 WHERE tc.constraint_type = 'PRIMARY KEY'
                   AND tc.table_schema = c.table_schema
                   AND tc.table_name = c.table_name
                   AND kcu.column_name = c.column_name
                 LIMIT 1), ''
            ) AS pk,
            COALESCE(
                (SELECT 'FK → ' || ccu.table_schema || '.' || ccu.table_name || '.' || ccu.column_name
                 FROM information_schema.table_constraints tc
                 JOIN information_schema.key_column_usage kcu
                   ON tc.constraint_name = kcu.constraint_name
                  AND tc.table_schema = kcu.table_schema
                 JOIN information_schema.constraint_column_usage ccu
                   ON tc.constraint_name = ccu.constraint_name
                 WHERE tc.constraint_type = 'FOREIGN KEY'
                   AND tc.table_schema = c.table_schema
                   AND tc.table_name = c.table_name
                   AND kcu.column_name = c.column_name
                 LIMIT 1), ''
            ) AS fk,
            pg_catalog.col_description(
                (c.table_schema||'.'||c.table_name)::regclass::oid,
                c.ordinal_position
            ) AS description
        FROM information_schema.columns c
        WHERE c.table_schema = ANY(%s)
        ORDER BY c.table_schema, c.table_name, c.ordinal_position
    """, (list(SCHEMAS),))
    cols = [d[0] for d in cur.description]
    return pd.DataFrame(cur.fetchall(), columns=cols)


def main():
    conn = psycopg2.connect(**DB)
    cur = conn.cursor()

    cur.execute("""
        SELECT schemaname, tablename FROM pg_tables
        WHERE schemaname = ANY(%s)
        ORDER BY schemaname, tablename
    """, (list(SCHEMAS),))
    tables = cur.fetchall()

    Path(OUT).parent.mkdir(parents=True, exist_ok=True)
    print(f"Exporting {len(tables)} tables → {OUT}")

    with pd.ExcelWriter(OUT, engine="openpyxl") as writer:
        # First sheet: full schema reference
        schema_df = fetch_schemas(cur, tables)
        schema_df.to_excel(writer, sheet_name="_schemas", index=False)
        print(f"  ✓ _schemas ({len(schema_df)} columns)")

        # One sheet per table
        for schema, table in tables:
            df = fetch_table(cur, schema, table)
            sname = sheet_name(schema, table)
            df.to_excel(writer, sheet_name=sname, index=False)
            print(f"  ✓ {sname} ({len(df)} rows)")

    conn.close()
    print(f"\nDone — {OUT}")


if __name__ == "__main__":
    main()

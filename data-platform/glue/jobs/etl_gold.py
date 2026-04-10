"""
Iceberg MERGE from S3 Bronze → S3 Gold via AWS Glue Data Catalog.
Merge key: (tenant_id, id) — universal across all tables.

AWS Glue Python Shell job. Runtime provides awsglue, boto3.
"""
import sys
from datetime import datetime, timezone

def merge_bronze_to_gold(database: str, table: str) -> None:
    """
    MERGE INTO future_gold.{table}
    USING future_bronze.{table}
    ON gold.tenant_id = bronze.tenant_id AND gold.id = bronze.id
    WHEN MATCHED THEN UPDATE SET ...
    WHEN NOT MATCHED THEN INSERT ...
    """
    # TODO: implement via Athena query execution (boto3 athena client)
    raise NotImplementedError(f'merge_bronze_to_gold({database}.{table}): implement Athena MERGE')

if __name__ == '__main__':
    run_ts = datetime.now(timezone.utc).isoformat()
    print(f'ETL Gold run started: {run_ts}')
    # TODO: list Bronze tables from Glue Data Catalog and MERGE each into Gold

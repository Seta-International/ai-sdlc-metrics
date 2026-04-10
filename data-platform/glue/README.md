# AWS Glue ETL

Hourly batch pipeline: RDS → S3 Bronze (Parquet) → S3 Gold (Iceberg) → Athena.

See `docs/architecture/data-platform.md` for full pipeline spec.

## Deploy

```bash
GLUE_SCRIPTS_BUCKET=your-bucket ./deploy.sh
```

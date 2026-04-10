#!/usr/bin/env bash
# Uploads Glue scripts to S3 and updates Glue job definitions.
# TODO: wire to GitHub Actions deploy-glue.yml
set -euo pipefail

BUCKET="${GLUE_SCRIPTS_BUCKET:?GLUE_SCRIPTS_BUCKET env var required}"
AWS_REGION="${AWS_REGION:-ap-southeast-1}"

echo "Uploading Glue scripts to s3://$BUCKET/scripts/"
aws s3 cp jobs/etl_bronze.py "s3://$BUCKET/scripts/etl_bronze.py" --region "$AWS_REGION"
aws s3 cp jobs/etl_gold.py   "s3://$BUCKET/scripts/etl_gold.py"   --region "$AWS_REGION"

echo "TODO: aws glue update-job for etl_bronze and etl_gold"
echo "See docs/architecture/data-platform.md for full Glue job config."

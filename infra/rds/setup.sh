#!/usr/bin/env bash
# Creates the seta-reporting RDS Postgres instance.
# Prerequisites: aws CLI configured, REPORTING_DB_PASSWORD and REPORTING_SG_ID set.
set -euo pipefail

: "${REPORTING_DB_PASSWORD:?Set REPORTING_DB_PASSWORD}"
: "${REPORTING_SG_ID:?Set REPORTING_SG_ID (security group allowing 5432 from VPS + 0.0.0.0/0)}"
: "${REPORTING_DB_SUBNET_GROUP:?Set REPORTING_DB_SUBNET_GROUP (same VPC as app)}"

aws rds create-db-instance \
  --db-instance-identifier seta-reporting \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --engine-version 17 \
  --master-username reporting \
  --master-user-password "$REPORTING_DB_PASSWORD" \
  --db-name reporting \
  --allocated-storage 20 \
  --storage-type gp3 \
  --storage-encrypted \
  --backup-retention-period 7 \
  --publicly-accessible \
  --vpc-security-group-ids "$REPORTING_SG_ID" \
  --db-subnet-group-name "$REPORTING_DB_SUBNET_GROUP" \
  --no-multi-az

echo "Waiting for instance to become available..."
aws rds wait db-instance-available --db-instance-identifier seta-reporting

ENDPOINT=$(aws rds describe-db-instances \
  --db-instance-identifier seta-reporting \
  --query 'DBInstances[0].Endpoint.Address' \
  --output text)

echo ""
echo "RDS endpoint: $ENDPOINT"
echo ""
echo "Next steps:"
echo "  export REPORTING_DB_URL=\"postgresql://reporting:$REPORTING_DB_PASSWORD@$ENDPOINT:5432/reporting?sslmode=require\""
echo "  psql \$REPORTING_DB_URL -f infra/db/init.sql"
echo "  gh secret set REPORTING_DB_URL --body \"\$REPORTING_DB_URL\" --org Seta-International"
echo "  gh secret set REPORTING_DB_HOST --body \"$ENDPOINT\" --org Seta-International"

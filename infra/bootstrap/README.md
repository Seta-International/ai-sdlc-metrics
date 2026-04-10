# Terraform Bootstrap

Run once before any other Terraform ops to create the S3 state bucket and DynamoDB lock table.

```bash
cd infra/bootstrap
terraform init
terraform apply
```

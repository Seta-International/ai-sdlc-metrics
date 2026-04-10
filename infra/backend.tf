terraform {
  backend "s3" {
    # Bucket and table created by infra/bootstrap/main.tf
    bucket         = "future-terraform-state"
    key            = "future/terraform.tfstate"
    region         = "ap-southeast-1"
    dynamodb_table = "future-terraform-lock"
    encrypt        = true
  }
}

# Root Terraform configuration
# Calls all modules. See each module's main.tf for what it provisions.
# See docs/architecture/deployment.md for full infrastructure spec.

module "vpc"          { source = "./modules/vpc" }
module "alb"          { source = "./modules/alb" }
module "ecs_cluster"  { source = "./modules/ecs-cluster" }
module "rds"          { source = "./modules/rds" }
module "rds_langfuse" { source = "./modules/rds-langfuse" }
module "redis"        { source = "./modules/redis" }
module "ecr"          { source = "./modules/ecr" }
module "secrets"      { source = "./modules/secrets" }
module "glue"         { source = "./modules/glue" }
module "eventbridge"  { source = "./modules/eventbridge" }

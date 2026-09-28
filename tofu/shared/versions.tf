terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
  }
  backend "s3" {
    use_lockfile = true
    encrypt      = true
  }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = { project = "tito", managed-by = "opentofu" }
  }
}

data "aws_caller_identity" "me" {}

locals {
  account     = data.aws_caller_identity.me.account_id
  bucket_name = var.bucket_name != "" ? var.bucket_name : "tito-data-${local.account}"
}

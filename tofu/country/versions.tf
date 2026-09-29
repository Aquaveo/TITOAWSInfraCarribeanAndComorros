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
    tags = { project = "tito", managed-by = "opentofu", country = var.country }
  }
}

data "aws_caller_identity" "me" {}

data "terraform_remote_state" "shared" {
  backend = "s3"
  config = {
    bucket = var.state_bucket
    key    = "tito/shared.tfstate"
    region = var.region
  }
}

locals {
  name    = "tito-${var.country}"
  account = data.aws_caller_identity.me.account_id
  shared  = data.terraform_remote_state.shared.outputs

  streamsat = "/data/streamsat"
  efs_mounts = merge(
    {
      states = "/app/EF5_conf/states"
      run    = "/run/tito"
    },
    var.uses_streamsat ? {
      streamsat-state  = "${local.streamsat}/state"
      streamsat-output = "${local.streamsat}/output"
    } : {},
  )

  image_tag = "${var.country}-${var.tito_version}-${var.wrapper_rev}"

  static_prefix = "static/${var.country}/${var.data_version}"
  output_prefix = "outputs/${var.country}"
}

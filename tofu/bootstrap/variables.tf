variable "region" {
  type    = string
  default = "us-east-1"
}

variable "github_org" {
  type    = string
  default = "Aquaveo"
}

variable "github_org_id" {
  type        = number
  description = "Immutable GitHub org id, pinned in the OIDC subject."
}

variable "github_repo" {
  type    = string
  default = "TITOAWSInfraCarribeanAndComorros"
}

variable "github_repo_id" {
  type        = number
  description = "Immutable GitHub repo id, pinned in the OIDC subject."
}

variable "state_bucket" {
  type        = string
  description = "OpenTofu state bucket in this account."
}

variable "countries" {
  type    = list(string)
  default = ["guatemala", "haiti", "barbados", "antigua", "comoros"]
}

variable "create_oidc_provider" {
  type        = bool
  default     = true
  description = "False when the account already has the GitHub OIDC provider."
}

variable "data_bucket" {
  type        = string
  default     = ""
  description = "TITO data bucket. Empty means tito-data-<account>."
}

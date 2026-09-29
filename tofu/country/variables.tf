variable "region" {
  type    = string
  default = "us-east-1"
}

variable "state_bucket" {
  type = string
}

variable "permissions_boundary_arn" {
  type        = string
  description = "tito-ci-boundary from the bootstrap."
}

variable "country" {
  type        = string
  description = "Lowercase key: guatemala, haiti, barbados, antigua, comoros."
}

variable "tito_region" {
  type        = string
  description = "Region name TITO expects, e.g. Guatemala."
}

variable "tito_version" {
  type        = string
  description = "AHWA release deployed, e.g. 0.5.0."
}

variable "wrapper_rev" {
  type        = string
  description = "Git tree hash of wrapper/, set by CI."
}

variable "data_version" {
  type        = string
  description = "Static data version in S3, normally the AHWA release tag."
}

variable "cpu" {
  type        = number
  description = "Fargate task CPU units, 1024 per vCPU."
}

variable "memory" {
  type        = number
  description = "Fargate task memory in MiB."
}

variable "ef5_max_workers" {
  type        = number
  description = "Parallel EF5 jobs, about 3.5 GiB each at 90 m."
}

variable "ephemeral_storage_gib" {
  type    = number
  default = 40
}

variable "capacity_provider" {
  type    = string
  default = "FARGATE"
  validation {
    condition     = contains(["FARGATE", "FARGATE_SPOT"], var.capacity_provider)
    error_message = "Use FARGATE or FARGATE_SPOT."
  }
}

variable "schedule_enabled" {
  type    = bool
  default = false
}

variable "schedule_expression" {
  type    = string
  default = "cron(5 * * * ? *)"
}

variable "uses_streamsat" {
  type = bool
}

variable "streamsat_domain" {
  type    = string
  default = "caribbean"
}

variable "uses_hsaf" {
  type    = bool
  default = false
}

variable "strict_checks" {
  type        = bool
  default     = true
  description = "Stop the task when a TITO precondition fails."
}

variable "pps_yaml_override" {
  type        = bool
  default     = true
  description = "Blank AHWA's hardcoded PPS email in the task's copy until their fix lands."
}

variable "cycle_timeout_s" {
  type        = number
  default     = 3000
  description = "Seconds before a hung cycle is killed."
}

variable "log_retention_days" {
  type    = number
  default = 30
}

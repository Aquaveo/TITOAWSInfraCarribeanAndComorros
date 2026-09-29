variable "region" {
  type    = string
  default = "us-east-1"
}

variable "vpc_id" {
  type        = string
  description = "VPC for the tasks. Public subnets, so no NAT gateway."
}

variable "subnet_ids" {
  type        = list(string)
  description = "Public subnets, one EFS mount target each."
}

variable "bucket_name" {
  type        = string
  default     = ""
  description = "Data bucket name. Empty means tito-data-<account>."
}

variable "outputs_expiration_days" {
  type        = number
  default     = 30
  description = "Days cycle outputs stay in S3. Lifecycle rules count whole days."
}

variable "alert_emails" {
  type        = list(string)
  default     = []
  sensitive   = true
  description = "From the ALERT_EMAILS secret."
}

variable "container_insights" {
  type    = bool
  default = false
}

variable "countries" {
  type    = list(string)
  default = ["guatemala", "haiti", "barbados", "antigua", "comoros"]
}

variable "images_per_country" {
  type    = number
  default = 10
}

variable "site_domain" {
  type        = string
  default     = ""
  description = "Custom name for the viewer, e.g. tito.uffis.org. Empty keeps only the CloudFront name."
}

variable "site_domain_delegated" {
  type        = bool
  default     = false
  description = "Set true once the parent zone has the site_name_servers NS records; adds the certificate and alias."
}

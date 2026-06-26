variable "package_path" {
  description = "Path to the zipped Functions app package. Uploaded to blob storage and run via WEBSITE_RUN_FROM_PACKAGE. CI builds this before apply."
  type        = string
}

variable "location" {
  description = "Azure region for all resources. West Europe is capacity-constrained for new Cosmos accounts, so default to North Europe."
  type        = string
  default     = "northeurope"
}

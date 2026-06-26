variable "location" {
  description = "Azure region for all resources. West Europe is capacity-constrained for new Cosmos accounts, so default to North Europe."
  type        = string
  default     = "northeurope"
}

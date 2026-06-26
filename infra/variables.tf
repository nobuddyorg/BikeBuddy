variable "location" {
  description = "Azure region for all resources. West Europe is capacity-constrained for new Cosmos accounts, so default to North Europe."
  type        = string
  default     = "northeurope"
}

# Microsoft Entra External ID (#8). Empty defaults keep the API in SKIP_AUTH mode
# until the external tenant is created and these are supplied (via CI variables).
variable "entra_tenant_subdomain" {
  description = "External ID tenant subdomain, e.g. \"bikebuddy\" for bikebuddy.ciamlogin.com."
  type        = string
  default     = ""
}

variable "entra_tenant_id" {
  description = "External ID directory (tenant) GUID."
  type        = string
  default     = ""
}

variable "entra_client_id" {
  description = "Application (client) ID of the API/SPA app registration. Also the token audience."
  type        = string
  default     = ""
}

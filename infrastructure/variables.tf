variable "location" {
  description = "Azure region for all resources. West Europe is capacity-constrained for new Cosmos accounts, so default to North Europe."
  type        = string
  default     = "northeurope"
}

# Microsoft Entra External ID; deploy.yml passes the repository variables, empty means no-auth mode.
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

variable "budget_amount" {
  description = "Monthly budget amount in the subscription's billing currency."
  type        = number
  default     = 5
}

variable "budget_contact_email" {
  description = "Email that receives budget threshold alerts. The subscription owner by default."
  type        = string
  default     = "nobuddyorgcloud@outlook.com"
}

variable "budget_start_date" {
  description = "Budget start date (must be the first of a month, RFC3339)."
  type        = string
  default     = "2026-06-01T00:00:00Z"
}

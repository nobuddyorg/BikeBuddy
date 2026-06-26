output "functions_url" {
  description = "Base URL of the Azure Functions API (no trailing slash)."
  value       = "https://${azurerm_function_app_flex_consumption.main.default_hostname}"
}

output "functions_app_name" {
  value = azurerm_function_app_flex_consumption.main.name
}

output "functions_url" {
  description = "Base URL of the Azure Functions API (no trailing slash)."
  value       = "https://${azurerm_linux_function_app.main.default_hostname}"
}

output "functions_app_name" {
  value = azurerm_linux_function_app.main.name
}

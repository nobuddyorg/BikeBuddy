output "functions_url" {
  description = "Base URL of the Azure Functions API (no trailing slash)."
  value       = "https://${azurerm_function_app_flex_consumption.main.default_hostname}"
}

output "functions_app_name" {
  value = azurerm_function_app_flex_consumption.main.name
}

# For the one-time role grant of the budget stop (docs/how-to/infrastructure.md, "Budget stop").
output "budget_stop_principal_id" {
  value = azurerm_logic_app_workflow.budget_stop.identity[0].principal_id
}

output "functions_app_id" {
  value = azurerm_function_app_flex_consumption.main.id
}

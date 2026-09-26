# Run: cd infrastructure && tofu init -backend=false && tofu test
# The recovery windows the restore runbook (docs/how-to/infrastructure.md) promises.

mock_provider "azurerm" {
  mock_resource "azurerm_resource_group" {
    defaults = { id = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/bikebuddy-rg" }
  }
  mock_resource "azurerm_service_plan" {
    defaults = { id = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/bikebuddy-rg/providers/Microsoft.Web/serverFarms/bikebuddy-plan" }
  }
  mock_resource "azurerm_storage_account" {
    defaults = {
      id                    = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/bikebuddy-rg/providers/Microsoft.Storage/storageAccounts/bikebuddyfilesabc123"
      primary_blob_endpoint = "https://bikebuddyfilesabc123.blob.core.windows.net/"
    }
  }
  mock_resource "azurerm_logic_app_workflow" {
    defaults = { id = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/bikebuddy-rg/providers/Microsoft.Logic/workflows/bikebuddy-budget-stop" }
  }
  mock_resource "azurerm_monitor_action_group" {
    defaults = { id = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/bikebuddy-rg/providers/Microsoft.Insights/actionGroups/bikebuddy-budget-stop" }
  }
  mock_resource "azurerm_logic_app_trigger_http_request" {
    defaults = { callback_url = "https://prod-00.northeurope.logic.azure.com/workflows/mock/triggers/budget-exceeded/paths/invoke" }
  }
  mock_resource "azurerm_log_analytics_workspace" {
    defaults = { id = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/bikebuddy-rg/providers/Microsoft.OperationalInsights/workspaces/bikebuddy-logs" }
  }
  mock_resource "azurerm_application_insights" {
    defaults = {
      id                = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/bikebuddy-rg/providers/Microsoft.Insights/components/bikebuddy-insights"
      connection_string = "InstrumentationKey=00000000-0000-0000-0000-000000000000"
    }
  }
  mock_resource "azurerm_application_insights_standard_web_test" {
    defaults = { id = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/bikebuddy-rg/providers/Microsoft.Insights/webTests/bikebuddy-health" }
  }
}

mock_provider "random" {
  mock_resource "random_string" {
    defaults = { result = "abc123" }
  }
}

variables {
  entra_tenant_subdomain = "bikebuddy"
  entra_tenant_id        = "00000000-0000-0000-0000-000000000000"
  entra_client_id        = "11111111-1111-1111-1111-111111111111"
}

run "cosmos_keeps_seven_days_of_point_in_time_restore" {
  command = plan
  assert {
    condition     = azurerm_cosmosdb_account.main.backup[0].type == "Continuous" && azurerm_cosmosdb_account.main.backup[0].tier == "Continuous7Days"
    error_message = "Cosmos must run continuous backup at the 7-day tier."
  }
}

run "blobs_stay_recoverable_for_fourteen_days" {
  command = plan
  assert {
    condition = alltrue([
      azurerm_storage_account.main.blob_properties[0].versioning_enabled,
      azurerm_storage_account.main.blob_properties[0].delete_retention_policy[0].days == 14,
      azurerm_storage_account.main.blob_properties[0].container_delete_retention_policy[0].days == 14,
      azurerm_storage_management_policy.main.rule[0].actions[0].version[0].delete_after_days_since_creation == 14,
    ])
    error_message = "Blob versioning, 14-day soft delete and 14-day version expiry must stay on."
  }
}

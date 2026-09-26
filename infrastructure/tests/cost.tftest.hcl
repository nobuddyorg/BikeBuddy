# Run: cd infrastructure && tofu init -backend=false && tofu test
# Plans against mock providers: no Azure credentials, nothing is created.
# The cost ceiling (#549): how far the app can scale, and what stops it once the budget is spent.

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
  mock_resource "azurerm_function_app_flex_consumption" {
    defaults = { id = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/bikebuddy-rg/providers/Microsoft.Web/sites/bikebuddy-api-abc123" }
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

run "scaling_is_capped" {
  command = plan
  assert {
    condition     = azurerm_function_app_flex_consumption.main.maximum_instance_count <= 10
    error_message = "maximum_instance_count is the hard cost ceiling (#549); raising it is a cost decision."
  }
}

run "a_spent_budget_stops_the_function_app" {
  command = plan
  assert {
    condition = anytrue([
      for notification in azurerm_consumption_budget_resource_group.main.notification :
      notification.threshold == 100 && notification.threshold_type == "Actual" &&
      contains(coalesce(notification.contact_groups, []), azurerm_monitor_action_group.budget_stop.id)
    ])
    error_message = "The actual-spend notification must call the stop action group (#549)."
  }
  assert {
    condition     = azurerm_monitor_action_group.budget_stop.logic_app_receiver[0].resource_id == azurerm_logic_app_workflow.budget_stop.id
    error_message = "The action group must call the budget stop Logic App."
  }
  assert {
    condition = (
      jsondecode(azurerm_logic_app_action_custom.stop_function_app.body).inputs.uri ==
      "https://management.azure.com${azurerm_function_app_flex_consumption.main.id}/stop?api-version=2024-04-01"
    )
    error_message = "The Logic App must stop this Function App, and nothing else."
  }
  assert {
    condition     = jsondecode(azurerm_logic_app_action_custom.stop_function_app.body).inputs.authentication.type == "ManagedServiceIdentity"
    error_message = "The stop call authenticates as the Logic App's own identity, never with a stored secret."
  }
  assert {
    condition     = azurerm_logic_app_workflow.budget_stop.identity[0].type == "SystemAssigned"
    error_message = "The role an Owner grants goes to the Logic App's system-assigned identity."
  }
}

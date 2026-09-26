# Run: cd infrastructure && tofu init -backend=false && tofu test
# Plans against mock providers: no Azure credentials, nothing is created.

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

run "refuses_to_deploy_without_entra" {
  command = plan
  variables {
    entra_tenant_subdomain = ""
    entra_tenant_id        = ""
    entra_client_id        = ""
  }
  expect_failures = [azurerm_function_app_flex_consumption.main]
}

run "refuses_a_blank_entra_client_id" {
  command = plan
  variables {
    entra_tenant_subdomain = "bikebuddy"
    entra_tenant_id        = "00000000-0000-0000-0000-000000000000"
    entra_client_id        = "   "
  }
  expect_failures = [azurerm_function_app_flex_consumption.main]
}

run "deploys_with_entra_and_never_sets_skip_auth" {
  command = plan
  variables {
    entra_tenant_subdomain = "bikebuddy"
    entra_tenant_id        = "00000000-0000-0000-0000-000000000000"
    entra_client_id        = "11111111-1111-1111-1111-111111111111"
  }
  assert {
    condition     = !contains(keys(azurerm_function_app_flex_consumption.main.app_settings), "SKIP_AUTH")
    error_message = "SKIP_AUTH must never reach the deployed app settings."
  }
}

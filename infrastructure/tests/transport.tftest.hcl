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

variables {
  entra_tenant_subdomain = "bikebuddy"
  entra_tenant_id        = "00000000-0000-0000-0000-000000000000"
  entra_client_id        = "11111111-1111-1111-1111-111111111111"
}

run "the_api_answers_over_https_only" {
  command = plan
  assert {
    condition     = azurerm_function_app_flex_consumption.main.https_only == true
    error_message = "The Function App must set https_only, or it also answers over plain HTTP."
  }
  assert {
    condition     = azurerm_function_app_flex_consumption.main.site_config[0].minimum_tls_version == "1.2"
    error_message = "The Function App must refuse TLS below 1.2."
  }
  assert {
    condition     = azurerm_function_app_flex_consumption.main.webdeploy_publish_basic_authentication_enabled == false
    error_message = "The Function App must not offer basic-auth publishing credentials."
  }
}

run "production_cors_trusts_https_origins_only" {
  command = plan
  assert {
    condition = alltrue([
      for origin in azurerm_function_app_flex_consumption.main.site_config[0].cors[0].allowed_origins :
      startswith(origin, "https://")
    ])
    error_message = "The API's CORS list must hold HTTPS origins only (no http://localhost)."
  }
  assert {
    condition = alltrue(flatten([
      for rule in azurerm_storage_account.main.blob_properties[0].cors_rule :
      [for origin in rule.allowed_origins : startswith(origin, "https://")]
    ]))
    error_message = "The storage CORS rules must hold HTTPS origins only (no http://localhost)."
  }
}

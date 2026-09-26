# Run: cd infrastructure && tofu init -backend=false && tofu test
# Plans against mock providers: no Azure credentials, nothing is created.
# Telemetry and alerting (#547): what reaches Application Insights, and what wakes someone up.

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

run "the_api_reports_to_application_insights_within_a_cap" {
  command = plan
  assert {
    condition     = azurerm_function_app_flex_consumption.main.site_config[0].application_insights_connection_string == azurerm_application_insights.main.connection_string
    error_message = "The Functions host sends its telemetry to Application Insights only with the connection string."
  }
  assert {
    condition     = azurerm_application_insights.main.daily_data_cap_in_gb <= 0.1 && azurerm_log_analytics_workspace.main.daily_quota_gb <= 0.1
    error_message = "Ingestion stays capped: a flood of logs must not become a bill (#549)."
  }
}

run "an_outage_and_failures_alert_the_maintainer" {
  command = plan
  assert {
    condition     = azurerm_application_insights_standard_web_test.health.request[0].url == "https://${azurerm_function_app_flex_consumption.main.default_hostname}/api/v1/health"
    error_message = "The availability test probes the public liveness route."
  }
  assert {
    condition = alltrue([
      for alert in [azurerm_monitor_metric_alert.health, azurerm_monitor_metric_alert.failed_requests] :
      contains([for action in alert.action : action.action_group_id], azurerm_monitor_action_group.ops.id)
    ])
    error_message = "Every metric alert mails the maintainer through the ops action group."
  }
  assert {
    condition     = contains(azurerm_monitor_scheduled_query_rules_alert_v2.auth_failures.action[0].action_groups, azurerm_monitor_action_group.ops.id)
    error_message = "Token failures mail the maintainer through the ops action group."
  }
  assert {
    condition     = strcontains(azurerm_monitor_scheduled_query_rules_alert_v2.auth_failures.criteria[0].query, "auth: unable to verify token")
    error_message = "The query matches the log line authMiddleware.js writes when it cannot verify a token."
  }
  assert {
    condition     = azurerm_monitor_action_group.ops.email_receiver[0].email_address == var.budget_contact_email
    error_message = "Alerts go to the same contact as the budget."
  }
}

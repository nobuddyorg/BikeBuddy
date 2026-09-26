# Telemetry and alerting (#547): the Functions host sends requests, failures and console output to
# Application Insights; alerts mail the budget contact. Both caps keep ingestion inside the free
# grant (docs/cost-report.md, "Monitoring").
resource "azurerm_log_analytics_workspace" "main" {
  name                = "bikebuddy-logs"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
  daily_quota_gb      = 0.1
  tags                = local.tags
}

resource "azurerm_application_insights" "main" {
  name                 = "bikebuddy-insights"
  location             = azurerm_resource_group.main.location
  resource_group_name  = azurerm_resource_group.main.name
  workspace_id         = azurerm_log_analytics_workspace.main.id
  application_type     = "Node.JS"
  daily_data_cap_in_gb = 0.1
  tags                 = local.tags
}

resource "azurerm_monitor_action_group" "ops" {
  name                = "bikebuddy-ops"
  resource_group_name = azurerm_resource_group.main.name
  short_name          = "bbops"
  tags                = local.tags

  email_receiver {
    name                    = "maintainer"
    email_address           = var.budget_contact_email
    use_common_alert_schema = true
  }
}

# Every 15 minutes from one region: enough to notice an outage, a few thousand runs a month.
resource "azurerm_application_insights_standard_web_test" "health" {
  name                    = "bikebuddy-health"
  location                = azurerm_resource_group.main.location
  resource_group_name     = azurerm_resource_group.main.name
  application_insights_id = azurerm_application_insights.main.id
  frequency               = 900
  timeout                 = 30
  retry_enabled           = true
  geo_locations           = ["emea-gb-db3-azr"] # North Europe
  tags                    = local.tags

  request {
    url = "https://${azurerm_function_app_flex_consumption.main.default_hostname}/api/v1/health"
  }

  validation_rules {
    expected_status_code = 200
  }
}

resource "azurerm_monitor_metric_alert" "health" {
  name                = "bikebuddy-health-down"
  resource_group_name = azurerm_resource_group.main.name
  scopes              = [azurerm_application_insights_standard_web_test.health.id, azurerm_application_insights.main.id]
  description         = "GET /api/v1/health failed: the API is down."
  severity            = 1
  frequency           = "PT5M"
  window_size         = "PT15M"
  tags                = local.tags

  application_insights_web_test_location_availability_criteria {
    web_test_id           = azurerm_application_insights_standard_web_test.health.id
    component_id          = azurerm_application_insights.main.id
    failed_location_count = 1
  }

  action {
    action_group_id = azurerm_monitor_action_group.ops.id
  }
}

# Unexpected failures answer 500 and 503 (functions/src/lib/failureResponse.js).
resource "azurerm_monitor_metric_alert" "failed_requests" {
  name                = "bikebuddy-failed-requests"
  resource_group_name = azurerm_resource_group.main.name
  scopes              = [azurerm_application_insights.main.id]
  description         = "More than 5 failed API requests in 15 minutes."
  severity            = 2
  frequency           = "PT5M"
  window_size         = "PT15M"
  tags                = local.tags

  criteria {
    metric_namespace = "microsoft.insights/components"
    metric_name      = "requests/failed"
    aggregation      = "Count"
    operator         = "GreaterThan"
    threshold        = 5
  }

  action {
    action_group_id = azurerm_monitor_action_group.ops.id
  }
}

# The log lines of functions/src/middleware/authMiddleware.js: any failure to verify is ours (the
# OIDC metadata or keys are unreachable); rejected tokens are normal, a burst of them is not.
resource "azurerm_monitor_scheduled_query_rules_alert_v2" "auth_failures" {
  name                 = "bikebuddy-auth-failures"
  location             = azurerm_resource_group.main.location
  resource_group_name  = azurerm_resource_group.main.name
  scopes               = [azurerm_application_insights.main.id]
  description          = "Tokens cannot be verified, or more than 50 are rejected in 15 minutes."
  severity             = 2
  evaluation_frequency = "PT15M"
  window_duration      = "PT15M"
  tags                 = local.tags

  criteria {
    query                   = <<-KQL
      traces
      | where message startswith "auth: unable to verify token"
          or message startswith "auth: rejected"
      // One failure to verify alone passes the threshold; rejections need a burst.
      | summarize failures = countif(message startswith "auth: unable to verify token") * 100
          + countif(message startswith "auth: rejected")
    KQL
    metric_measure_column   = "failures"
    time_aggregation_method = "Maximum"
    operator                = "GreaterThan"
    threshold               = 50
  }

  action {
    action_groups = [azurerm_monitor_action_group.ops.id]
  }
}

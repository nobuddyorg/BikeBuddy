resource "azurerm_consumption_budget_resource_group" "main" {
  name              = "bikebuddy-monthly-budget"
  resource_group_id = azurerm_resource_group.main.id

  amount     = var.budget_amount
  time_grain = "Monthly"

  time_period {
    start_date = var.budget_start_date
  }

  notification {
    enabled        = true
    threshold      = 80
    operator       = "GreaterThanOrEqualTo"
    threshold_type = "Forecasted"
    contact_emails = [var.budget_contact_email]
  }

  # Spent, not forecast: this one also stops the Function App (#549).
  notification {
    enabled        = true
    threshold      = 100
    operator       = "GreaterThanOrEqualTo"
    threshold_type = "Actual"
    contact_emails = [var.budget_contact_email]
    contact_groups = [azurerm_monitor_action_group.budget_stop.id]
  }
}

# The budget's action group calls this Logic App, which stops the Function App. Its identity needs
# Website Contributor on the app, granted once by an Owner: the deploy principal cannot assign
# roles (docs/how-to/infrastructure.md, "Budget stop"). Until then only the emails go out.
resource "azurerm_logic_app_workflow" "budget_stop" {
  name                = "bikebuddy-budget-stop"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  tags                = local.tags

  identity {
    type = "SystemAssigned"
  }
}

resource "azurerm_logic_app_trigger_http_request" "budget_exceeded" {
  name         = "budget-exceeded"
  logic_app_id = azurerm_logic_app_workflow.budget_stop.id
  schema       = jsonencode({})
}

resource "azurerm_logic_app_action_custom" "stop_function_app" {
  name         = "stop-function-app"
  logic_app_id = azurerm_logic_app_workflow.budget_stop.id
  body = jsonencode({
    type = "Http"
    inputs = {
      method = "POST"
      uri    = "https://management.azure.com${azurerm_function_app_flex_consumption.main.id}/stop?api-version=2024-04-01"
      authentication = {
        type     = "ManagedServiceIdentity"
        audience = "https://management.azure.com/"
      }
    }
    runAfter = {}
  })
}

resource "azurerm_monitor_action_group" "budget_stop" {
  name                = "bikebuddy-budget-stop"
  resource_group_name = azurerm_resource_group.main.name
  short_name          = "budgetstop"
  tags                = local.tags

  logic_app_receiver {
    name        = "stop-function-app"
    resource_id = azurerm_logic_app_workflow.budget_stop.id
    # The URL carries the trigger's signature, which would let anyone stop the app: never in a plan.
    callback_url            = sensitive(azurerm_logic_app_trigger_http_request.budget_exceeded.callback_url)
    use_common_alert_schema = true
  }
}

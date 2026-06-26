# Monthly cost guard rail (#3): alert before spend exceeds the free/serverless
# tier target. Notifies at 80% (forecast) and 100% (actual) of the budget.
resource "azurerm_consumption_budget_resource_group" "main" {
  name              = "bikebuddy-monthly-budget"
  resource_group_id = azurerm_resource_group.main.id

  amount     = var.budget_amount
  time_grain = "Monthly"

  time_period {
    start_date = var.budget_start_date
  }

  # Early warning on the forecast trending over budget.
  notification {
    enabled        = true
    threshold      = 80
    operator       = "GreaterThanOrEqualTo"
    threshold_type = "Forecasted"
    contact_emails = [var.budget_contact_email]
  }

  # Actual spend reached the budget.
  notification {
    enabled        = true
    threshold      = 100
    operator       = "GreaterThanOrEqualTo"
    threshold_type = "Actual"
    contact_emails = [var.budget_contact_email]
  }
}

resource "azurerm_service_plan" "main" {
  name                = "bikebuddy-plan"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  os_type             = "Linux"
  sku_name            = "Y1" # Consumption — first 1 M requests/month free
}

resource "azurerm_linux_function_app" "main" {
  name                       = "bikebuddy-api"
  resource_group_name        = azurerm_resource_group.main.name
  location                   = azurerm_resource_group.main.location
  service_plan_id            = azurerm_service_plan.main.id
  storage_account_name       = azurerm_storage_account.main.name
  storage_account_access_key = azurerm_storage_account.main.primary_access_key

  app_settings = {
    COSMOS_CONNECTION_STRING = "AccountEndpoint=${azurerm_cosmosdb_account.main.endpoint};AccountKey=${azurerm_cosmosdb_account.main.primary_key};"
    COSMOS_DATABASE          = "bikebuddy"
    BLOB_CONNECTION_STRING   = azurerm_storage_account.main.primary_connection_string
    B2C_TENANT               = "placeholder.onmicrosoft.com"
    B2C_CLIENT_ID            = "placeholder"
    B2C_POLICY               = "B2C_1_signupsignin"
    # Switch to false once Azure AD B2C is configured (#8).
    SKIP_AUTH                = "true"
    WEBSITE_RUN_FROM_PACKAGE = "1"
  }

  site_config {
    application_stack {
      node_version = "22"
    }

    cors {
      allowed_origins = [
        # Custom domain the GitHub Pages site is served from (https://nobuddy.org/BikeBuddy/).
        "https://nobuddy.org",
        # Default github.io host, kept as a fallback if the custom domain is removed.
        "https://nobuddyorg.github.io",
        "http://localhost:4280",
      ]
    }
  }
}

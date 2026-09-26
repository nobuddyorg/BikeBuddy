resource "azurerm_service_plan" "main" {
  name                = "bikebuddy-plan"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  os_type             = "Linux"
  sku_name            = "FC1" # Flex Consumption
  tags                = local.tags
}

resource "azurerm_function_app_flex_consumption" "main" {
  name                = "bikebuddy-api-${random_string.suffix.result}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  service_plan_id     = azurerm_service_plan.main.id
  https_only          = true
  tags                = local.tags

  # Flex deploys the app package from a blob container (not WEBSITE_RUN_FROM_PACKAGE).
  storage_container_type      = "blobContainer"
  storage_container_endpoint  = "${azurerm_storage_account.main.primary_blob_endpoint}${azurerm_storage_container.deployments.name}"
  storage_authentication_type = "StorageAccountConnectionString"
  storage_access_key          = azurerm_storage_account.main.primary_access_key

  runtime_name          = "node"
  runtime_version       = "24"
  instance_memory_in_mb = 2048
  # The hard cost ceiling (#549): a handful of riders never needs more, and each instance keeps
  # its own upload rate limit, so this also bounds how far one rider can get past it.
  maximum_instance_count = 10

  app_settings = {
    COSMOS_CONNECTION_STRING = "AccountEndpoint=${azurerm_cosmosdb_account.main.endpoint};AccountKey=${azurerm_cosmosdb_account.main.primary_key};"
    COSMOS_DATABASE          = "bikebuddy"
    BLOB_CONNECTION_STRING   = azurerm_storage_account.main.primary_connection_string
    # No SKIP_AUTH: the auth bypass is local-only and never deployed.
    ENTRA_TENANT_SUBDOMAIN = var.entra_tenant_subdomain
    ENTRA_TENANT_ID        = var.entra_tenant_id
    ENTRA_CLIENT_ID        = var.entra_client_id
  }

  lifecycle {
    # Fails closed: a missing repository variable stops the deploy instead of shipping an API without auth.
    precondition {
      condition = alltrue([
        for value in [var.entra_tenant_subdomain, var.entra_tenant_id, var.entra_client_id] :
        trimspace(value) != ""
      ])
      error_message = "entra_tenant_subdomain, entra_tenant_id and entra_client_id must all be set: the API is never deployed without auth."
    }
  }

  site_config {
    minimum_tls_version = "1.2"
    # Requests, failures and console output (#547, monitoring.tf).
    application_insights_connection_string = azurerm_application_insights.main.connection_string
    # HTTPS only: local development runs its own Functions host, never against production.
    cors {
      allowed_origins = [
        # Custom domain the GitHub Pages site is served from (https://nobuddy.org/BikeBuddy/).
        "https://nobuddy.org",
        # Default github.io host, kept as a fallback if the custom domain is removed.
        "https://nobuddyorg.github.io",
      ]
    }
  }
}

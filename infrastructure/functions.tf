resource "azurerm_service_plan" "main" {
  name                = "bikebuddy-plan"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  os_type             = "Linux"
  sku_name            = "FC1" # Flex Consumption — true serverless, scales to zero, no VM quota
  tags                = local.tags
}

resource "azurerm_function_app_flex_consumption" "main" {
  name                = "bikebuddy-api-${random_string.suffix.result}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  service_plan_id     = azurerm_service_plan.main.id
  tags                = local.tags

  # Flex deploys the app package from a blob container (not WEBSITE_RUN_FROM_PACKAGE).
  storage_container_type      = "blobContainer"
  storage_container_endpoint  = "${azurerm_storage_account.main.primary_blob_endpoint}${azurerm_storage_container.deployments.name}"
  storage_authentication_type = "StorageAccountConnectionString"
  storage_access_key          = azurerm_storage_account.main.primary_access_key

  runtime_name           = "node"
  runtime_version        = "22"
  instance_memory_in_mb  = 2048
  maximum_instance_count = 40

  app_settings = {
    COSMOS_CONNECTION_STRING = "AccountEndpoint=${azurerm_cosmosdb_account.main.endpoint};AccountKey=${azurerm_cosmosdb_account.main.primary_key};"
    COSMOS_DATABASE          = "bikebuddy"
    BLOB_CONNECTION_STRING   = azurerm_storage_account.main.primary_connection_string
    # Microsoft Entra External ID (#8). Empty until the external tenant exists;
    # CI fills these from repo variables and flips SKIP_AUTH to false.
    ENTRA_TENANT_SUBDOMAIN = var.entra_tenant_subdomain
    ENTRA_TENANT_ID        = var.entra_tenant_id
    ENTRA_CLIENT_ID        = var.entra_client_id
    SKIP_AUTH              = var.entra_client_id == "" ? "true" : "false"
  }

  site_config {
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

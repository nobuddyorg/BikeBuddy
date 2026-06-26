resource "azurerm_service_plan" "main" {
  name                = "bikebuddy-plan"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  os_type             = "Linux"
  sku_name            = "Y1" # Consumption — first 1 M requests/month free
  tags                = local.tags
}

# Read-only SAS so the Functions host can pull the deployment package blob.
# Fixed start/expiry keeps the SAS stable across applies (no spurious diffs).
data "azurerm_storage_account_sas" "package" {
  connection_string = azurerm_storage_account.main.primary_connection_string
  https_only        = true

  resource_types {
    service   = false
    container = false
    object    = true
  }

  services {
    blob  = true
    queue = false
    table = false
    file  = false
  }

  start  = "2024-01-01T00:00:00Z"
  expiry = "2034-01-01T00:00:00Z"

  permissions {
    read    = true
    write   = false
    delete  = false
    list    = false
    add     = false
    create  = false
    update  = false
    process = false
    tag     = false
    filter  = false
  }
}

resource "azurerm_linux_function_app" "main" {
  name                       = "bikebuddy-api"
  resource_group_name        = azurerm_resource_group.main.name
  location                   = azurerm_resource_group.main.location
  service_plan_id            = azurerm_service_plan.main.id
  storage_account_name       = azurerm_storage_account.main.name
  storage_account_access_key = azurerm_storage_account.main.primary_access_key
  tags                       = local.tags

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
    # Run the code straight from the package blob — the canonical, az-CLI-free
    # deployment method for Linux Consumption.
    WEBSITE_RUN_FROM_PACKAGE = "${azurerm_storage_blob.app_package.url}${data.azurerm_storage_account_sas.package.sas}"
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

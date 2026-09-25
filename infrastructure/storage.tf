resource "azurerm_storage_account" "main" {
  name                            = "bikebuddyfiles${random_string.suffix.result}"
  resource_group_name             = azurerm_resource_group.main.name
  location                        = azurerm_resource_group.main.location
  account_tier                    = "Standard"
  account_replication_type        = "LRS"
  min_tls_version                 = "TLS1_2"
  https_traffic_only_enabled      = true
  allow_nested_items_to_be_public = false
  tags                            = local.tags

  blob_properties {
    # A deleted or overwritten blob or container stays recoverable for 14 days (restore runbook: infrastructure.md).
    versioning_enabled = true
    delete_retention_policy {
      days = 14
    }
    container_delete_retention_policy {
      days = 14
    }

    # Allow the browser to fetch images directly from blob SAS URLs.
    cors_rule {
      allowed_origins    = ["https://nobuddy.org", "https://nobuddyorg.github.io", "http://localhost:4280"]
      allowed_methods    = ["GET", "HEAD"]
      allowed_headers    = ["*"]
      exposed_headers    = ["*"]
      max_age_in_seconds = 3600
    }
  }

  lifecycle {
    prevent_destroy = true
  }
}

# Previous versions go after the same 14 days, so versioning never keeps data indefinitely.
resource "azurerm_storage_management_policy" "main" {
  storage_account_id = azurerm_storage_account.main.id

  rule {
    name    = "expire-previous-versions"
    enabled = true
    filters {
      blob_types = ["blockBlob"]
    }
    actions {
      version {
        delete_after_days_since_creation = 14
      }
    }
  }
}

resource "azurerm_storage_container" "gpx_files" {
  name                  = "gpx-files"
  storage_account_id    = azurerm_storage_account.main.id
  container_access_type = "private"

  lifecycle {
    prevent_destroy = true
  }
}

# tflint-ignore: azurerm_resources_missing_prevent_destroy # unused and empty; photos live in the unmanaged tour-images container
resource "azurerm_storage_container" "images" {
  name                  = "images"
  storage_account_id    = azurerm_storage_account.main.id
  container_access_type = "private"
}

# Flex Consumption's deployment package container (functions.tf, storage_container_endpoint).
# tflint-ignore: azurerm_resources_missing_prevent_destroy # holds only the app package, which every deploy re-uploads
resource "azurerm_storage_container" "deployments" {
  name                  = "deployments"
  storage_account_id    = azurerm_storage_account.main.id
  container_access_type = "private"
}

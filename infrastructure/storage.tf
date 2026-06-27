# Encryption at rest is on by default with Microsoft-managed keys (AES-256) — no
# config needed. We stay on platform-managed keys (no CMK/Key Vault) to keep
# within the cost target; see docs/explanation/design-decisions.md.
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

  # Allow the browser to fetch images directly from blob SAS URLs.
  blob_properties {
    cors_rule {
      allowed_origins    = ["https://nobuddy.org", "https://nobuddyorg.github.io", "http://localhost:4280"]
      allowed_methods    = ["GET", "HEAD"]
      allowed_headers    = ["*"]
      exposed_headers    = ["*"]
      max_age_in_seconds = 3600
    }
  }
}

resource "azurerm_storage_container" "gpx_files" {
  name                  = "gpx-files"
  storage_account_id    = azurerm_storage_account.main.id
  container_access_type = "private"
}

resource "azurerm_storage_container" "images" {
  name                  = "images"
  storage_account_id    = azurerm_storage_account.main.id
  container_access_type = "private"
}

# Holds the zipped Functions package that the app runs via WEBSITE_RUN_FROM_PACKAGE.
resource "azurerm_storage_container" "deployments" {
  name                  = "deployments"
  storage_account_id    = azurerm_storage_account.main.id
  container_access_type = "private"
}

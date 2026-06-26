resource "azurerm_cosmosdb_account" "main" {
  name                = "bikebuddy-cosmos-${random_string.suffix.result}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  offer_type          = "Standard"
  kind                = "GlobalDocumentDB"

  consistency_policy {
    consistency_level = "Session"
  }

  geo_location {
    location          = azurerm_resource_group.main.location
    failover_priority = 0
    # West Europe is capacity-constrained for zone-redundant accounts; not needed here.
    zone_redundant = false
  }

  # Serverless: pay per request, no idle cost.
  capabilities {
    name = "EnableServerless"
  }

  tags = local.tags
}

resource "azurerm_cosmosdb_sql_database" "main" {
  name                = "bikebuddy"
  resource_group_name = azurerm_resource_group.main.name
  account_name        = azurerm_cosmosdb_account.main.name
}

resource "azurerm_cosmosdb_sql_container" "users" {
  name                = "users"
  resource_group_name = azurerm_resource_group.main.name
  account_name        = azurerm_cosmosdb_account.main.name
  database_name       = azurerm_cosmosdb_sql_database.main.name
  partition_key_paths = ["/id"]

  indexing_policy {
    indexing_mode = "consistent"
    included_path { path = "/*" }
  }
}

resource "azurerm_cosmosdb_sql_container" "tours" {
  name                = "tours"
  resource_group_name = azurerm_resource_group.main.name
  account_name        = azurerm_cosmosdb_account.main.name
  database_name       = azurerm_cosmosdb_sql_database.main.name
  partition_key_paths = ["/userId"]

  indexing_policy {
    indexing_mode = "consistent"
    included_path { path = "/*" }
    # heatmapData and images are never queried — exclude from index to
    # keep document write cost low and stay under the 2 MB Cosmos limit.
    excluded_path { path = "/heatmapData/*" }
    excluded_path { path = "/images/*" }
  }
}

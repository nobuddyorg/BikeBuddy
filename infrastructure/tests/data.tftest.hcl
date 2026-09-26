# Run: cd infrastructure && tofu init -backend=false && tofu test
# Plans against mock providers: no Azure credentials, nothing is created.
# The data containers the Functions code reads by name and partitions by the token's user id.

mock_provider "azurerm" {
  mock_resource "azurerm_resource_group" {
    defaults = { id = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/bikebuddy-rg" }
  }
  mock_resource "azurerm_service_plan" {
    defaults = { id = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/bikebuddy-rg/providers/Microsoft.Web/serverFarms/bikebuddy-plan" }
  }
  mock_resource "azurerm_storage_account" {
    defaults = {
      id                    = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/bikebuddy-rg/providers/Microsoft.Storage/storageAccounts/bikebuddyfilesabc123"
      primary_blob_endpoint = "https://bikebuddyfilesabc123.blob.core.windows.net/"
    }
  }
}

mock_provider "random" {
  mock_resource "random_string" {
    defaults = { result = "abc123" }
  }
}

variables {
  entra_tenant_subdomain = "bikebuddy"
  entra_tenant_id        = "00000000-0000-0000-0000-000000000000"
  entra_client_id        = "11111111-1111-1111-1111-111111111111"
}

run "tracks_are_partitioned_like_tours" {
  command = plan
  assert {
    condition     = azurerm_cosmosdb_sql_container.tracks.name == "tracks"
    error_message = "functions/src/lib/db.js opens the tracks container by the name \"tracks\"."
  }
  assert {
    condition = (
      azurerm_cosmosdb_sql_container.tracks.partition_key_paths ==
      azurerm_cosmosdb_sql_container.tours.partition_key_paths
    )
    error_message = "A track sits in its tour's partition key (/userId), read by the tour's id (#615)."
  }
  assert {
    condition = contains(
      [for path in azurerm_cosmosdb_sql_container.tracks.indexing_policy[0].excluded_path : path.path],
      "/heatmapData/*",
    )
    error_message = "Track points are read by id only; indexing them would only raise the write RU."
  }
}

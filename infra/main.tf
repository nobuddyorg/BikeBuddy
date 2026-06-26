terraform {
  required_version = ">= 1.8"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  backend "azurerm" {
    resource_group_name  = "bikebuddy-tfstate-rg"
    storage_account_name = "bikebuddytfstate8769"
    container_name       = "tfstate"
    key                  = "bikebuddy.tfstate"
  }
}

provider "azurerm" {
  features {}
}

locals {
  tags = {
    project = "bikebuddy"
    env     = "prod"
  }
}

# Suffix for globally-unique resource names (storage, cosmos, function app) so
# the config applies cleanly in any subscription without name collisions.
resource "random_string" "suffix" {
  length  = 6
  special = false
  upper   = false
}

resource "azurerm_resource_group" "main" {
  name     = "bikebuddy-rg"
  location = var.location
  tags     = local.tags
}

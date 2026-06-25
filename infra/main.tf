terraform {
  required_version = ">= 1.8"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
  }

  backend "azurerm" {
    resource_group_name  = "bikebuddy-tfstate-rg"
    storage_account_name = "bikebuddytfstate"
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

resource "azurerm_resource_group" "main" {
  name     = "bikebuddy-rg"
  location = "westeurope"
  tags     = local.tags
}

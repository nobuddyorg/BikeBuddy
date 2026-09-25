# TFLint for infrastructure/ (OpenTofu): the bundled terraform ruleset plus the
# azurerm ruleset (deprecated arguments, invalid SKUs/locations/sizes).
# Run: ./buddy.sh quality iac
config {
  call_module_type = "none"
}

plugin "terraform" {
  enabled = true
  preset  = "recommended"
}

plugin "azurerm" {
  enabled = true
  version = "0.32.0"
  source  = "github.com/terraform-linters/tflint-ruleset-azurerm"
}

# prevent_destroy on stateful resources is #543's decision: it also blocks
# destroy.yml's `tofu destroy`, so it lands with a destroy-path design, not here.
rule "azurerm_resources_missing_prevent_destroy" {
  enabled = false
}

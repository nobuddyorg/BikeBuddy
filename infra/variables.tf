variable "package_path" {
  description = "Path to the zipped Functions app package. Uploaded to blob storage and run via WEBSITE_RUN_FROM_PACKAGE. CI builds this before apply."
  type        = string
}

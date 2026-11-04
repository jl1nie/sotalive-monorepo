terraform {
  required_version = ">= 1.8.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }

  # state は Cloudflare R2(S3 互換)に置く。
  # 認証は AWS_ACCESS_KEY_ID・AWS_SECRET_ACCESS_KEY、エンドポイントは AWS_ENDPOINT_URL_S3(infra/.env.example)。
  backend "s3" {
    bucket = "sotalive-tfstate"
    key    = "sotalive/terraform.tfstate"
    region = "auto"

    # R2 は AWS ではないので、AWS 向けの確認を切る
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    skip_s3_checksum            = true
    use_path_style              = true
  }
}

provider "cloudflare" {
  # api_token は環境変数 CLOUDFLARE_API_TOKEN から読む
}

variable "cloudflare_account_id" {
  description = "Cloudflare のアカウント ID(TF_VAR_cloudflare_account_id)"
  type        = string
}

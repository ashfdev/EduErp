// Phase 0 IaC baseline — provisions the shared infra for one environment
// (dev/staging/prod). Deploy per-environment with -p environmentName=<env>.
// Not wired into CI yet — apply manually with `az deployment group create`
// until Azure subscription credentials are available (see README).

@description('Environment name: dev | staging | prod')
param environmentName string = 'dev'

@description('Azure region — no BD region exists; Southeast Asia (Singapore) is lowest-latency to Dhaka')
param location string = 'southeastasia'

@secure()
param postgresAdminPassword string

var namePrefix = 'eduerp-${environmentName}'

resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: '${namePrefix}-plan'
  location: location
  sku: {
    name: environmentName == 'prod' ? 'P1v3' : 'B1'
    tier: environmentName == 'prod' ? 'PremiumV3' : 'Basic'
  }
  properties: {
    reserved: true // Linux
  }
}

resource coreApiApp 'Microsoft.Web/sites@2023-12-01' = {
  name: '${namePrefix}-core-api'
  location: location
  properties: {
    serverFarmId: appServicePlan.id
    siteConfig: {
      linuxFxVersion: 'NODE|20-lts'
      alwaysOn: environmentName != 'dev'
    }
    httpsOnly: true
  }
}

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2023-12-01-preview' = {
  name: '${namePrefix}-pg'
  location: location
  sku: {
    name: environmentName == 'prod' ? 'Standard_D2ds_v5' : 'Standard_B1ms'
    tier: environmentName == 'prod' ? 'GeneralPurpose' : 'Burstable'
  }
  properties: {
    version: '16'
    administratorLogin: 'eduerp_admin'
    administratorLoginPassword: postgresAdminPassword
    storage: {
      storageSizeGB: 32
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: environmentName == 'prod' ? 'Enabled' : 'Disabled'
    }
  }
}

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: replace('${namePrefix}storage', '-', '')
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
  }
}

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: '${namePrefix}-kv'
  location: location
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
  }
}

output coreApiUrl string = 'https://${coreApiApp.properties.defaultHostName}'
output postgresHost string = postgres.properties.fullyQualifiedDomainName
output storageAccountName string = storageAccount.name
output keyVaultName string = keyVault.name

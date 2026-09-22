Write-Host "Building Tauri Desktop app..."
npm run tauri build

Write-Host "Building Tauri Android app..."
npm run tauri android build

Write-Host "Copying installers to Installers directory..."
if (-not (Test-Path "Installers")) {
    New-Item -ItemType Directory -Path "Installers" | Out-Null
}

$version = (Get-Content package.json | ConvertFrom-Json).version
$msiPath = "src-tauri\target\release\bundle\msi\Coffee Shop ERP_$version`_x64_en-US.msi"
$exePath = "src-tauri\target\release\bundle\nsis\Coffee Shop ERP_$version`_x64-setup.exe"
$apkPath = "src-tauri\gen\android\app\build\outputs\apk\universal\release\app-universal-release-unsigned.apk"

if (Test-Path $msiPath) {
    Copy-Item -Path $msiPath -Destination "Installers\CoffeeShopERP.msi" -Force
    Write-Host "Copied MSI"
}
if (Test-Path $exePath) {
    Copy-Item -Path $exePath -Destination "Installers\CoffeeShopERP-setup.exe" -Force
    Write-Host "Copied EXE"
}
if (Test-Path $apkPath) {
    Copy-Item -Path $apkPath -Destination "Installers\CoffeeShopERP.apk" -Force
    Write-Host "Copied APK"
}

Write-Host "Done!"

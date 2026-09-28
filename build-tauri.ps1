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
    $destApk = "Installers\CoffeeShopERP.apk"
    Copy-Item -Path $apkPath -Destination $destApk -Force
    Write-Host "Copied APK"

    $apksigner = Get-ChildItem -Path "$env:LOCALAPPDATA\Android\Sdk\build-tools" -Filter "apksigner.bat" -Recurse | Select-Object -First 1 -ExpandProperty FullName
    $keystore = "$env:USERPROFILE\.android\debug.keystore"
    if ($apksigner -and (Test-Path $keystore)) {
        Write-Host "Signing APK with debug keystore..."
        & $apksigner sign --ks $keystore --ks-pass pass:android --key-pass pass:android $destApk
        & $apksigner verify $destApk
        Write-Host "APK signed successfully!"
    } else {
        Write-Host "Warning: apksigner or debug.keystore not found, APK remains unsigned." -ForegroundColor Yellow
    }
}

Write-Host "Done!"

# scripts/check-dev.ps1 - Tests local dev server connectivity
$ErrorActionPreference = "Continue"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "         SMARTCAMPUS LOCAL CONNECTIVITY VERIFICATION      " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$allPass = $true

# 1. Check API /health
Write-Host "`n[*] Checking API /health on http://localhost:4000/health..."
try {
    $resHealth = Invoke-WebRequest -Uri "http://localhost:4000/health" -Method Get -TimeoutSec 5 -UseBasicParsing
    if ($resHealth.StatusCode -eq 200) {
        Write-Host "    [PASS] API /health returned status 200 OK" -ForegroundColor Green
    } else {
        Write-Host "    [FAIL] API /health returned status $($resHealth.StatusCode)" -ForegroundColor Red
        $allPass = $false
    }
} catch {
    Write-Host "    [FAIL] Could not connect to API at http://localhost:4000/health: $_" -ForegroundColor Red
    $allPass = $false
}

# 2. Check Web Root on http://localhost:3000
Write-Host "`n[*] Checking Web frontend on http://localhost:3000..."
try {
    $resWeb = Invoke-WebRequest -Uri "http://localhost:3000" -Method Get -TimeoutSec 5 -UseBasicParsing
    if ($resWeb.StatusCode -eq 200) {
        Write-Host "    [PASS] Web frontend returned status 200 OK" -ForegroundColor Green
    } else {
        Write-Host "    [FAIL] Web frontend returned status $($resWeb.StatusCode)" -ForegroundColor Red
        $allPass = $false
    }
} catch {
    Write-Host "    [FAIL] Could not connect to Web frontend at http://localhost:3000: $_" -ForegroundColor Red
    $allPass = $false
}

# 3. Check OPTIONS preflight to /events with Origin: http://localhost:3000
Write-Host "`n[*] Checking CORS OPTIONS preflight to http://localhost:4000/events with Origin: http://localhost:3000..."
try {
    $headers = @{
        "Origin" = "http://localhost:3000"
        "Access-Control-Request-Method" = "GET"
    }
    $resOptions = Invoke-WebRequest -Uri "http://localhost:4000/events" -Method Options -Headers $headers -TimeoutSec 5 -UseBasicParsing
    $corsHeader = $resOptions.Headers["access-control-allow-origin"]
    if (-not $corsHeader) {
        $corsHeader = $resOptions.Headers["Access-Control-Allow-Origin"]
    }
    Write-Host "    Header access-control-allow-origin: '$corsHeader'"

    if ($corsHeader -eq "http://localhost:3000" -or $corsHeader -eq "*") {
        Write-Host "    [PASS] Preflight returned correct access-control-allow-origin: $corsHeader" -ForegroundColor Green
    } else {
        Write-Host "    [FAIL] Preflight missing or incorrect access-control-allow-origin header ($corsHeader)" -ForegroundColor Red
        $allPass = $false
    }
} catch {
    Write-Host "    [FAIL] Preflight failed: $_" -ForegroundColor Red
    $allPass = $false
}

Write-Host "`n----------------------------------------------------------"
if ($allPass) {
    Write-Host "[PASS] ALL DEV CONNECTIVITY CHECKS PASSED" -ForegroundColor Green
    exit 0
} else {
    Write-Host "[FAIL] SOME DEV CONNECTIVITY CHECKS FAILED" -ForegroundColor Red
    exit 1
}

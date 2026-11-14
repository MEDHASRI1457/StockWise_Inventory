$mongo = 'C:\Program Files\MongoDB\Server\8.3\bin\mongod.exe'
$data = Join-Path $env:LOCALAPPDATA 'StockWiseMongo\data'
$log = Join-Path $env:LOCALAPPDATA 'StockWiseMongo\log\mongod.log'

if (-not (Test-Path $mongo)) {
  throw "MongoDB executable not found: $mongo"
}

if (-not (Test-Path $data)) {
  New-Item -ItemType Directory -Force -Path $data | Out-Null
}

if (-not (Test-Path (Split-Path $log))) {
  New-Item -ItemType Directory -Force -Path (Split-Path $log) | Out-Null
}

$listener = Get-NetTCPConnection -LocalPort 27018 -State Listen -ErrorAction SilentlyContinue
if (-not $listener) {
  $arguments = "--dbpath `"$data`" --port 27018 --bind_ip 127.0.0.1 --replSet rs0 --logpath `"$log`" --logappend"
  Start-Process -FilePath $mongo -ArgumentList $arguments -WorkingDirectory (Split-Path $mongo) -WindowStyle Hidden
}

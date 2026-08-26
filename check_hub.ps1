$env:HUB_URL = "https://agent-hub-dhj6.onrender.com"
$env:HUB_SECRET = "ec57a01f1c80dd2fc6714c078306fae1"
while ($true) {
    $output = node hub.js inbox Voltava-Frontend 25 2>&1
    if ($output -and $output -ne "(no messages)") {
        Write-Output "MSG: $output"
    }
    Start-Sleep -Seconds 3
}

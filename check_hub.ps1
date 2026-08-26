while ($true) {
    $env:HUB_URL = "https://agent-hub-dhj6.onrender.com"
    $env:HUB_SECRET = "ec57a01f1c80dd2fc6714c078306fae1"
    node hub.js inbox Antigravity 25
    Start-Sleep -Seconds 5
}

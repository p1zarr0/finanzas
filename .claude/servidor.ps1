# Servidor web mínimo para probar la app en el navegador.
# No instala nada: usa lo que Windows ya trae.
param([int]$Puerto = 0)

# Si quien lanza el servidor eligió el puerto (variable PORT), se respeta.
if ($Puerto -eq 0) {
  $Puerto = if ($env:PORT) { [int]$env:PORT } else { 5173 }
}

$raiz = Split-Path -Parent $PSScriptRoot
$oyente = New-Object System.Net.HttpListener
$oyente.Prefixes.Add("http://localhost:$Puerto/")
$oyente.Start()
Write-Host "Servidor escuchando en http://localhost:$Puerto/  (raiz: $raiz)"

$tipos = @{
  '.html' = 'text/html; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.webmanifest' = 'application/manifest+json; charset=utf-8'
  '.gz'   = 'application/gzip'
  '.wasm' = 'application/wasm'
  '.svg'  = 'image/svg+xml'
  '.png'  = 'image/png'
  '.ico'  = 'image/x-icon'
}

while ($oyente.IsListening) {
  try {
    $ctx = $oyente.GetContext()
    $ruta = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
    if ($ruta -eq '/') { $ruta = '/index.html' }
    $archivo = Join-Path $raiz $ruta.TrimStart('/')

    if (Test-Path $archivo -PathType Leaf) {
      $ext = [System.IO.Path]::GetExtension($archivo).ToLower()
      $ctx.Response.ContentType = if ($tipos.ContainsKey($ext)) { $tipos[$ext] } else { 'application/octet-stream' }
      $bytes = [System.IO.File]::ReadAllBytes($archivo)
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
      $msg = [System.Text.Encoding]::UTF8.GetBytes('No encontrado')
      # El tamano hay que declararlo aqui tambien, igual que arriba: sin esto
      # HttpListener asume cero y escribir 13 bytes revienta. El navegador
      # recibia su 404 igual, pero cada archivo que faltaba dejaba un error
      # rojo en la consola del servidor.
      $ctx.Response.ContentType = 'text/plain; charset=utf-8'
      $ctx.Response.ContentLength64 = $msg.Length
      $ctx.Response.OutputStream.Write($msg, 0, $msg.Length)
    }
    $ctx.Response.OutputStream.Close()
  } catch {
    Write-Host "Error: $_"
  }
}


param(
  [string]$WorkbookPath = "",
  [string]$OutputDir = ""
)
$ErrorActionPreference = 'Stop'
if (-not $WorkbookPath) { $WorkbookPath = Join-Path (Split-Path $PSScriptRoot -Parent) 'IST layout Product.xlsm' }
if (-not $OutputDir) { $OutputDir = Join-Path $PSScriptRoot 'dist\layout-reference' }
New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
$excel = $null
$workbook = $null
try {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $workbook = $excel.Workbooks.Open($WorkbookPath, 0, $true)
  foreach ($sheet in $workbook.Worksheets) {
    if (-not $sheet.Name.StartsWith('Layout', [System.StringComparison]::OrdinalIgnoreCase)) { continue }
    $model = $sheet.Name.Substring(6).Trim()
    $slug = ($model.ToLowerInvariant() -replace '[^a-z0-9]+','-').Trim('-')
    if (-not $slug) { $slug = 'layout' }
    $sheet.PageSetup.Zoom = $false
    $sheet.PageSetup.FitToPagesWide = 1
    $sheet.PageSetup.FitToPagesTall = 1
    $sheet.PageSetup.Orientation = 2
    $sheet.ExportAsFixedFormat(0, (Join-Path $OutputDir "$slug.pdf"), 0, $true, $false)
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($sheet) | Out-Null
  }
} finally {
  if ($workbook) { $workbook.Close($false); [System.Runtime.InteropServices.Marshal]::ReleaseComObject($workbook) | Out-Null }
  if ($excel) { $excel.Quit(); [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null }
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}

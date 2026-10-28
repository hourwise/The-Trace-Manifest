param([ValidateSet('Quality','Plans','Test')][string]$Action='Quality')
$ErrorActionPreference='Stop'
$traceRoot=$env:TRACE_P4_OUTPUT_ROOT
if([string]::IsNullOrWhiteSpace($traceRoot)){$traceRoot='D:\TRACE\local-acquisition\news-p4-r2'}
if($traceRoot -notmatch '^[dD]:[\\/]'){throw 'P4 requires an absolute D: storage root'}
$traceRoot=[IO.Path]::GetFullPath($traceRoot)
$traceAncestor=$traceRoot
while(-not(Test-Path -LiteralPath $traceAncestor)){$traceAncestor=Split-Path -Parent $traceAncestor}
$traceCursor=Get-Item -LiteralPath $traceAncestor
while($traceCursor){if($traceCursor.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Use direct D: storage, not a reparse point'};$traceCursor=$traceCursor.Parent}
foreach($traceFolder in @('tmp','cache\npm','cache\huggingface','cache\models','logs','reports')){[IO.Directory]::CreateDirectory((Join-Path $traceRoot $traceFolder))|Out-Null}
$env:TRACE_LOCAL_DATA_ROOT=$traceRoot;$env:TRACE_P4_OUTPUT_ROOT=$traceRoot
if(-not $env:TRACE_P4_EVIDENCE_ROOT){$env:TRACE_P4_EVIDENCE_ROOT='D:\TRACE\local-acquisition\news-p3-r2-final'}
$env:TEMP=Join-Path $traceRoot 'tmp';$env:TMP=$env:TEMP;$env:TMPDIR=$env:TEMP
$env:npm_config_cache=Join-Path $traceRoot 'cache\npm';$env:npm_config_update_notifier='false';$env:npm_config_audit='false';$env:npm_config_fund='false'
$env:HF_HOME=Join-Path $traceRoot 'cache\huggingface';$env:TORCH_HOME=Join-Path $traceRoot 'cache\models';$env:XDG_CACHE_HOME=Join-Path $traceRoot 'cache'
$env:ASTRO_TELEMETRY_DISABLED='1';$env:WRANGLER_SEND_METRICS='false';$env:WRANGLER_LOG_PATH=Join-Path $traceRoot 'logs'
$traceRepo=Split-Path -Parent $PSScriptRoot
$traceTsx=Join-Path $traceRepo 'node_modules\tsx\dist\cli.mjs'
if(-not(Test-Path -LiteralPath $traceTsx)){$traceTsx=Join-Path (Split-Path -Parent (Split-Path -Parent $traceRepo)) 'node_modules\tsx\dist\cli.mjs'}
if(-not(Test-Path -LiteralPath $traceTsx)){throw 'Existing tsx dependency unavailable; no automatic installation'}
$env:NODE_OPTIONS='--require="'+(Join-Path $PSScriptRoot 'news-p4-offline-guard.cjs').Replace('\','/')+'"'
Push-Location -LiteralPath $traceRepo
try{switch($Action){'Quality'{& node $traceTsx -e "(async()=>{const {writeEvidence}=await import('./tests/real-news/evidence.ts');console.log(JSON.stringify(writeEvidence(process.env.TRACE_P4_OUTPUT_ROOT)));})().catch(e=>{console.error(e);process.exitCode=1;});"}
'Plans'{& node $traceTsx scripts/prepare-news-p4.ts}
'Test'{& node $traceTsx --test tests/news-import-p4.test.ts tests/news-import-migration-r1.test.ts tests/news-import-boundary-r1.test.ts}};$traceExit=$LASTEXITCODE}finally{Pop-Location}
exit $traceExit

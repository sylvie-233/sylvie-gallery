<#
.SYNOPSIS
    希尔薇图集本地环境运维脚本（MySQL + Redis + Mailpit + RustFS + API + Web + Admin）。

.DESCRIPTION
    封装 scripts/docker-compose.yml 的常用操作：启动、停止、重启、重置、构建、日志、
    状态、进入 MySQL 客户端、重新执行初始化 SQL、拉取镜像。

    另外提供 dev 模式：仅用容器运行 MySQL、Redis、Mailpit 与 RustFS，再用 pnpm 在本机启动
    API（3000）、Web（3001）与 Admin（3002），便于热更新开发。

.PARAMETER Action
    要执行的操作，默认 status：
      up        启动目标服务并等待健康检查（API / Web / Admin 会先重新构建镜像）
      down      停止并移除全部容器（保留数据卷）
      restart   重启目标服务并等待健康检查
      reset     删除数据卷后重新启动目标服务（会清空数据库与对象存储，需确认）
      build     重新构建 API / Web / Admin 镜像
      logs      查看目标服务日志
      cli       进入 MySQL 命令行
      status    查看容器状态与访问地址
      init      删除业务库并重新执行建表 SQL 与演示数据（需确认）
      pull      拉取 MySQL / Redis / Mailpit / RustFS 镜像，并以最新基础镜像重建应用
      dev       启动 MySQL / Redis / Mailpit / RustFS 容器后，在本机运行 pnpm dev（三端热更新）

.PARAMETER Target
    操作目标，默认 all（仅容器相关操作使用，dev 忽略）：
      mysql  仅 MySQL
      redis  仅 Redis 缓存与限流
      mailpit 仅 Mailpit 开发邮件捕获
      rustfs 仅 RustFS 对象存储
      api    仅 API（自动启动依赖的 MySQL / Redis / RustFS）
      web    仅 Web（自动启动依赖的 API / MySQL / Redis / RustFS）
      admin  仅 Admin（自动启动依赖的 API / MySQL / Redis / RustFS）
      all    MySQL + Redis + Mailpit + RustFS + API + Web + Admin

.PARAMETER Force
    reset / init 跳过二次确认；build 时禁用 Docker 构建缓存。

.PARAMETER Follow
    logs 操作是否持续跟踪输出。

.PARAMETER Tail
    logs 显示的最后行数，默认 200。

.PARAMETER TimeoutSeconds
    up / restart / reset 等待健康检查的超时秒数，默认 120。

.PARAMETER NoWait
    up / restart / reset 启动后不等待健康检查。

.EXAMPLE
    pwsh ./manage.ps1 up

.EXAMPLE
    pwsh ./manage.ps1 up -Target mysql

.EXAMPLE
    pwsh ./manage.ps1 up -Target admin

.EXAMPLE
    pwsh ./manage.ps1 build -Target admin

.EXAMPLE
    pwsh ./manage.ps1 logs -Target api -Follow -Tail 500

.EXAMPLE
    pwsh ./manage.ps1 reset -Force

.EXAMPLE
    pwsh ./manage.ps1 init

.EXAMPLE
    pwsh ./manage.ps1 status

.EXAMPLE
    pwsh ./manage.ps1 dev
#>
#Requires -Version 7.0
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('up', 'down', 'restart', 'reset', 'build', 'logs', 'cli', 'status', 'init', 'pull', 'dev')]
    [string]$Action = 'status',

    [ValidateSet('mysql', 'redis', 'mailpit', 'rustfs', 'api', 'web', 'admin', 'all')]
    [string]$Target = 'all',

    [switch]$Force,
    [switch]$Follow,

    [ValidateRange(1, 10000)]
    [int]$Tail = 200,

    [ValidateRange(5, 600)]
    [int]$TimeoutSeconds = 120,

    [switch]$NoWait
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# 统一 UTF-8 输出，避免中文在重定向/管道中乱码
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$ScriptRoot = $PSScriptRoot
$ComposeFile = Join-Path $ScriptRoot 'scripts/docker-compose.yml'
$MonorepoRoot = Join-Path $ScriptRoot 'gallery-monorepo'
$DatabaseName = 'sylvie_gallery'

$ContainerNames = @{
    mysql   = 'sylvie-mysql'
    redis   = 'sylvie-redis'
    mailpit = 'sylvie-mailpit'
    rustfs  = 'sylvie-rustfs'
    api     = 'sylvie-api'
    web     = 'sylvie-web'
    admin   = 'sylvie-admin'
}

$AppServices = @('api', 'web', 'admin')

function Assert-Prerequisites {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw '未找到 docker 命令，请先安装并启动 Docker Desktop。'
    }

    if (-not (Test-Path -LiteralPath $ComposeFile)) {
        throw "未找到 compose 文件：$ComposeFile"
    }

    & docker compose version *> $null
    if ($LASTEXITCODE -ne 0) {
        throw '当前 docker 不支持 compose v2，请升级 Docker Desktop。'
    }
}

function Assert-NodePrerequisites {
    if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
        throw '未找到 pnpm 命令，请先安装 Node.js，并执行 corepack enable（或 npm install -g pnpm）。'
    }

    if (-not (Test-Path -LiteralPath (Join-Path $MonorepoRoot 'package.json'))) {
        throw "未找到 monorepo 目录：$MonorepoRoot"
    }
}

function Invoke-Compose {
    param(
        [Parameter(Mandatory)]
        [string[]]$ComposeArgs
    )

    & docker compose --file $ComposeFile @ComposeArgs
    if ($LASTEXITCODE -ne 0) {
        throw "docker compose $($ComposeArgs -join ' ') 执行失败（退出码 $LASTEXITCODE）。"
    }
}

function Get-TargetServices {
    switch ($Target) {
        'mysql' { return @('mysql') }
        'redis' { return @('redis') }
        'mailpit' { return @('mailpit') }
        'rustfs' { return @('rustfs') }
        'api' { return @('api') }
        'web' { return @('web') }
        'admin' { return @('admin') }
        default { return @('mysql', 'redis', 'mailpit', 'rustfs', 'api', 'web', 'admin') }
    }
}

# 等待就绪时连同 compose 自动启动的上游服务一起检查
function Get-WaitServices {
    $services = Get-TargetServices
    $result = @()

    if ($services -contains 'mysql' -or $services -contains 'api' -or $services -contains 'web' -or $services -contains 'admin') {
        $result += 'mysql'
    }
    if ($services -contains 'redis' -or $services -contains 'api' -or $services -contains 'web' -or $services -contains 'admin') {
        $result += 'redis'
    }
    if ($services -contains 'mailpit' -or $services -contains 'api' -or $services -contains 'web' -or $services -contains 'admin') {
        $result += 'mailpit'
    }
    if ($services -contains 'rustfs' -or $services -contains 'api' -or $services -contains 'web' -or $services -contains 'admin') {
        $result += 'rustfs'
    }
    if ($services -contains 'api' -or $services -contains 'web' -or $services -contains 'admin') {
        $result += 'api'
    }
    if ($services -contains 'web') {
        $result += 'web'
    }
    if ($services -contains 'admin') {
        $result += 'admin'
    }

    return $result
}

function Get-ContainerHealth {
    param(
        [Parameter(Mandatory)]
        [string]$ContainerName
    )

    $result = & docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' $ContainerName 2>$null
    if ($LASTEXITCODE -ne 0) {
        return $null
    }

    return ($result | Select-Object -First 1)
}

function Get-DisplayName {
    param([string]$Service)
    switch ($Service) {
        'mysql' { 'MySQL' }
        'redis' { 'Redis' }
        'mailpit' { 'Mailpit' }
        'rustfs' { 'RustFS' }
        'api' { 'API' }
        'web' { 'Web' }
        'admin' { 'Admin' }
        default { $Service }
    }
}

function Wait-ContainerHealthy {
    param(
        [Parameter(Mandatory)]
        [string]$ContainerName,

        [Parameter(Mandatory)]
        [string]$DisplayName
    )

    if ($NoWait) {
        Write-Host '已跳过健康检查等待。' -ForegroundColor DarkGray
        return
    }

    Write-Host "等待 $DisplayName 就绪（最长 ${TimeoutSeconds}s）..." -ForegroundColor Cyan
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

    while ((Get-Date) -lt $deadline) {
        $status = Get-ContainerHealth -ContainerName $ContainerName

        switch ($status) {
            'healthy' {
                Write-Host "$DisplayName 已就绪。" -ForegroundColor Green
                return
            }
            'running' {
                # 未配置 healthcheck 的服务，容器运行即视为就绪
                Write-Host "$DisplayName 已启动。" -ForegroundColor Green
                return
            }
            'unhealthy' {
                throw "$DisplayName 健康检查失败，请执行：pwsh ./manage.ps1 logs -Target $Target -Follow"
            }
            default {
                Start-Sleep -Seconds 2
            }
        }
    }

    throw "等待 $DisplayName 就绪超时（${TimeoutSeconds}s），请执行：pwsh ./manage.ps1 logs -Target $Target -Follow"
}

function Wait-TargetHealthy {
    foreach ($service in (Get-WaitServices)) {
        Wait-ContainerHealthy -ContainerName $ContainerNames[$service] -DisplayName (Get-DisplayName $service)
    }
}

function Confirm-Destructive {
    param(
        [Parameter(Mandatory)]
        [string]$Message
    )

    if ($Force) {
        return
    }

    $answer = Read-Host "$Message 输入 YES 继续"
    if ($answer -ne 'YES') {
        Write-Host '已取消。' -ForegroundColor Yellow
        exit 0
    }
}

function Assert-TargetIncludes {
    param(
        [Parameter(Mandatory)]
        [string]$Service,
        [Parameter(Mandatory)]
        [string]$ActionName
    )

    $services = Get-TargetServices
    if ($services -notcontains $Service) {
        throw "$ActionName 需要目标包含 $Service，请使用 -Target $Service 或 -Target all。"
    }
}

function Get-EnvValue {
    param(
        [Parameter(Mandatory)]
        [string]$Name,
        [Parameter(Mandatory)]
        [string]$Default
    )

    $envPath = Join-Path $ScriptRoot 'scripts/.env'
    if (Test-Path -LiteralPath $envPath) {
        $line = Get-Content -LiteralPath $envPath |
            Where-Object { $_ -match "^\s*$([regex]::Escape($Name))\s*=" } |
            Select-Object -Last 1
        if ($line) {
            return ($line -split '=', 2)[1].Trim()
        }
    }

    return $Default
}

function Write-AccessUrls {
    $apiPort = Get-EnvValue -Name 'API_PORT' -Default '3000'
    $webPort = Get-EnvValue -Name 'WEB_PORT' -Default '8080'
    $adminPort = Get-EnvValue -Name 'ADMIN_PORT' -Default '8081'
    $rustfsConsolePort = Get-EnvValue -Name 'S3_CONSOLE_PORT' -Default '9001'

    Write-Host ''
    Write-Host '访问地址（以 scripts/.env 为准）：' -ForegroundColor Cyan
    if ($Target -in @('web', 'all')) {
        Write-Host "  前台 Web      http://localhost:$webPort"
    }
    if ($Target -in @('admin', 'all')) {
        Write-Host "  管理后台      http://localhost:$adminPort"
    }
    if ($Target -in @('api', 'web', 'admin', 'all')) {
        Write-Host "  API 健康检查  http://localhost:$apiPort/health"
    }
    if ($Target -in @('rustfs', 'all')) {
        Write-Host "  RustFS 控制台 http://localhost:$rustfsConsolePort"
    }
    if ($Target -in @('mysql', 'all')) {
        $mysqlPort = Get-EnvValue -Name 'MYSQL_PORT' -Default '3306'
        Write-Host "  MySQL         localhost:$mysqlPort（库 $DatabaseName）"
    }
    if ($Target -in @('redis', 'all')) {
        $redisPort = Get-EnvValue -Name 'REDIS_PORT' -Default '6379'
        Write-Host "  Redis         localhost:$redisPort"
    }
    if ($Target -in @('mailpit', 'all')) {
        $mailpitUiPort = Get-EnvValue -Name 'MAILPIT_UI_PORT' -Default '8025'
        $mailpitSmtpPort = Get-EnvValue -Name 'MAILPIT_SMTP_PORT' -Default '1025'
        Write-Host "  Mailpit       http://localhost:$mailpitUiPort（SMTP $mailpitSmtpPort）"
    }
    Write-Host '  后台演示账号  admin / 123456'
}

function Invoke-MySqlInit {
    Write-Host '重新初始化数据库（删除业务库后重跑建表 SQL 与演示数据）...' -ForegroundColor Cyan

    Invoke-Compose -ComposeArgs @(
        'exec', '-T', 'mysql', 'sh', '-c',
        "MYSQL_PWD=`"`$MYSQL_ROOT_PASSWORD`" mysql -uroot -e `"DROP DATABASE IF EXISTS $DatabaseName`""
    )
    Invoke-Compose -ComposeArgs @(
        'exec', '-T', 'mysql', 'sh', '-c',
        'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot < /docker-entrypoint-initdb.d/01-schema.sql'
    )
    Invoke-Compose -ComposeArgs @(
        'exec', '-T', 'mysql', 'sh', '-c',
        'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot < /docker-entrypoint-initdb.d/02-demo-data.sql'
    )

    # 业务库重建后重启 API，丢弃指向旧库的数据库连接池
    if ((Get-TargetServices) -contains 'api' -and $null -ne (Get-ContainerHealth -ContainerName $ContainerNames['api'])) {
        Write-Host '重启 API 以重建数据库连接池...' -ForegroundColor Cyan
        Invoke-Compose -ComposeArgs @('restart', 'api')
        Wait-ContainerHealthy -ContainerName $ContainerNames['api'] -DisplayName 'API'
    }

    Write-Host '初始化完成。' -ForegroundColor Green
}

function Invoke-DevMode {
    Assert-Prerequisites
    Assert-NodePrerequisites

    Write-Host '停止容器化应用服务，释放 3000 / 3001 / 3002 端口...' -ForegroundColor DarkGray
    & docker compose --file $ComposeFile stop api web admin *> $null

    Invoke-Compose -ComposeArgs @('up', '-d', 'mysql', 'redis', 'mailpit', 'rustfs')
    Write-Host '等待 MySQL / Redis / Mailpit / RustFS 就绪...' -ForegroundColor Cyan
    foreach ($service in @('mysql', 'redis', 'mailpit', 'rustfs')) {
        Wait-ContainerHealthy -ContainerName $ContainerNames[$service] -DisplayName (Get-DisplayName $service)
    }

    Write-Host ''
    Write-Host '启动本地开发服务（Ctrl+C 结束）：' -ForegroundColor Cyan
    Write-Host '  API    http://localhost:3000'
    Write-Host '  前台   http://localhost:3001'
    Write-Host '  后台   http://localhost:3002（admin / 123456）'
    Write-Host ''

    Push-Location $MonorepoRoot
    try {
        & pnpm dev
        if ($LASTEXITCODE -ne 0) {
            throw "pnpm dev 执行失败（退出码 $LASTEXITCODE）。"
        }
    }
    finally {
        Pop-Location
    }
}

Assert-Prerequisites

switch ($Action) {
    'up' {
        $services = Get-TargetServices
        $upArgs = @('up', '-d')
        if ($services | Where-Object { $_ -in $AppServices }) {
            # 容器化运行时确保使用最新源码构建应用
            $upArgs += '--build'
        }
        $upArgs += $services
        Invoke-Compose -ComposeArgs $upArgs
        Wait-TargetHealthy
        Write-AccessUrls
    }

    'down' {
        # down 作用于整个 compose 项目，-Target 不参与
        Invoke-Compose -ComposeArgs @('down')
        Write-Host '全部容器已停止并移除（数据卷保留）。' -ForegroundColor Green
    }

    'restart' {
        Invoke-Compose -ComposeArgs (@('restart') + (Get-TargetServices))
        Wait-TargetHealthy
        Write-AccessUrls
    }

    'reset' {
        Confirm-Destructive -Message '将删除 MySQL、Redis、Mailpit 与 RustFS 数据卷，数据库、缓存、测试邮件、头像与图集原图都会丢失。'
        Invoke-Compose -ComposeArgs @('down', '-v')

        $services = Get-TargetServices
        $upArgs = @('up', '-d')
        if ($services | Where-Object { $_ -in $AppServices }) {
            $upArgs += '--build'
        }
        $upArgs += $services
        Invoke-Compose -ComposeArgs $upArgs
        Wait-TargetHealthy
        Write-AccessUrls
    }

    'build' {
        $buildServices = @((Get-TargetServices) | Where-Object { $_ -in $AppServices })
        if ($buildServices.Count -eq 0) {
            throw 'build 需要目标包含 api / web / admin，请使用 -Target api、web、admin 或 all。'
        }
        $buildArgs = @('build')
        if ($Force) {
            $buildArgs += '--no-cache'
        }
        $buildArgs += $buildServices
        Invoke-Compose -ComposeArgs $buildArgs
        Write-Host '镜像构建完成。' -ForegroundColor Green
    }

    'logs' {
        $logArgs = @('logs', '--tail', "$Tail")
        if ($Follow) {
            $logArgs += '-f'
        }
        $logArgs += Get-TargetServices
        Invoke-Compose -ComposeArgs $logArgs
    }

    'cli' {
        Assert-TargetIncludes -Service 'mysql' -ActionName 'cli'
        Invoke-Compose -ComposeArgs @(
            'exec', 'mysql', 'sh', '-c',
            'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot "$MYSQL_DATABASE"'
        )
    }

    'status' {
        Invoke-Compose -ComposeArgs @('ps')

        foreach ($service in Get-TargetServices) {
            $container = $ContainerNames[$service]
            $health = Get-ContainerHealth -ContainerName $container

            if ($null -eq $health) {
                Write-Host "$service（$container）尚未创建，执行 up 启动。" -ForegroundColor Yellow
                continue
            }

            $color = if ($health -eq 'healthy' -or $health -eq 'running') {
                'Green'
            }
            elseif ($health -eq 'unhealthy') {
                'Red'
            }
            else {
                'Yellow'
            }
            Write-Host "$service（$container）状态：$health" -ForegroundColor $color
        }

        Write-AccessUrls
    }

    'init' {
        Assert-TargetIncludes -Service 'mysql' -ActionName 'init'
        Confirm-Destructive -Message '将删除业务库并重新建表、写入演示数据，原有业务数据会丢失。'
        Invoke-MySqlInit
    }

    'pull' {
        $services = Get-TargetServices
        if ($services -contains 'mysql') {
            Invoke-Compose -ComposeArgs @('pull', 'mysql')
        }
        if ($services -contains 'redis') {
            Invoke-Compose -ComposeArgs @('pull', 'redis')
        }
        if ($services -contains 'mailpit') {
            Invoke-Compose -ComposeArgs @('pull', 'mailpit')
        }
        if ($services -contains 'rustfs') {
            Invoke-Compose -ComposeArgs @('pull', 'rustfs')
        }
        foreach ($service in ($services | Where-Object { $_ -in $AppServices })) {
            Invoke-Compose -ComposeArgs @('build', '--pull', $service)
        }
        Write-Host '镜像拉取 / 重建完成。' -ForegroundColor Green
    }

    'dev' {
        Invoke-DevMode
    }
}

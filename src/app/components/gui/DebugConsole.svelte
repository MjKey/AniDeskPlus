<script>
    import { onMount, onDestroy } from "svelte";

    let logs = [];
    let isCollapsed = true;
    let activeFilter = "all"; // all, net, info, error
    let autoScroll = true;
    let logsContainer;

    function addLog(log) {
        logs = [...logs.slice(-300), log]; // Keep last 300 logs
        if (autoScroll && logsContainer) {
            setTimeout(() => {
                if (logsContainer) logsContainer.scrollTop = logsContainer.scrollHeight;
            }, 50);
        }
    }

    onMount(() => {
        if (window.debugApi?.onLog) {
            window.debugApi.onLog((log) => {
                addLog(log);
            });
        }

        // Catch global unhandled JS errors in renderer
        const handleErr = (event) => {
            addLog({
                timestamp: new Date().toLocaleTimeString(),
                type: "error",
                message: `[JS ERROR] ${event.message || event.reason}`,
                data: event.filename ? `${event.filename}:${event.lineno}` : null
            });
        };

        window.addEventListener("error", handleErr);
        window.addEventListener("unhandledrejection", handleErr);

        addLog({
            timestamp: new Date().toLocaleTimeString(),
            type: "info",
            message: "Debug Console initialized. Listening for logs & network requests...",
        });

        return () => {
            window.removeEventListener("error", handleErr);
            window.removeEventListener("unhandledrejection", handleErr);
        };
    });

    function clearLogs() {
        logs = [];
    }

    $: filteredLogs = logs.filter((l) => {
        if (activeFilter === "all") return true;
        if (activeFilter === "net") return l.type === "net";
        if (activeFilter === "info") return l.type === "info" || l.type === "log";
        if (activeFilter === "error") return l.type === "error" || l.type === "warn";
        return true;
    });
</script>

<div class="debug-console-wrapper" class:collapsed={isCollapsed}>
    {#if isCollapsed}
        <button
            class="debug-floating-badge flex-row"
            onclick={() => (isCollapsed = false)}
        >
            <span class="badge-icon">🐞</span>
            <span class="badge-title">Debug Console</span>
            <span class="badge-count">({logs.length})</span>
        </button>
    {:else}
        <div class="debug-console-panel flex-column">
            <div class="debug-console-header flex-row">
                <div class="header-left flex-row">
                    <span class="badge-icon">🐞</span>
                    <span class="header-title">Live Debug Console</span>
                    <span class="logs-count">{filteredLogs.length} / {logs.length}</span>
                </div>

                <div class="filter-tabs flex-row">
                    <button
                        class="tab-btn"
                        class:active={activeFilter === 'all'}
                        onclick={() => (activeFilter = 'all')}>Все</button
                    >
                    <button
                        class="tab-btn net-tab"
                        class:active={activeFilter === 'net'}
                        onclick={() => (activeFilter = 'net')}>Network</button
                    >
                    <button
                        class="tab-btn info-tab"
                        class:active={activeFilter === 'info'}
                        onclick={() => (activeFilter = 'info')}>Logs</button
                    >
                    <button
                        class="tab-btn err-tab"
                        class:active={activeFilter === 'error'}
                        onclick={() => (activeFilter = 'error')}>Errors</button
                    >
                </div>

                <div class="header-right flex-row">
                    <label class="autoscroll-label flex-row">
                        <input type="checkbox" bind:checked={autoScroll} />
                        <span>Auto-scroll</span>
                    </label>
                    <button class="action-btn" onclick={clearLogs} title="Очистить">🗑</button>
                    <button class="action-btn" onclick={() => (isCollapsed = true)} title="Свернуть">—</button>
                </div>
            </div>

            <div class="debug-logs-list flex-column" bind:this={logsContainer}>
                {#if filteredLogs.length === 0}
                    <div class="empty-logs flex-row">
                        <span>Логи отсутствуют...</span>
                    </div>
                {:else}
                    {#each filteredLogs as log}
                        <div class="log-entry flex-row" class:net={log.type === 'net'} class:error={log.type === 'error'} class:warn={log.type === 'warn'} class:info={log.type === 'info'}>
                            <span class="log-time">[{log.timestamp}]</span>
                            <span class="log-tag">[{log.type.toUpperCase()}]</span>
                            <span class="log-msg">{log.message}</span>
                            {#if log.data}
                                <span class="log-data">{typeof log.data === 'object' ? JSON.stringify(log.data) : log.data}</span>
                            {/if}
                        </div>
                    {/each}
                {/if}
            </div>
        </div>
    {/if}
</div>

<style>
    .debug-console-wrapper {
        position: fixed;
        bottom: 10px;
        right: 15px;
        z-index: 100000;
        font-family: monospace, monospace;
    }

    .debug-floating-badge {
        background-color: rgba(26, 26, 26, 0.95);
        border: 1px solid #e74c3c;
        color: #ffffff;
        padding: 6px 14px;
        border-radius: 20px;
        cursor: pointer;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
        transition: transform 0.2s, background-color 0.2s;
    }

    .debug-floating-badge:hover {
        transform: translateY(-2px);
        background-color: rgba(40, 40, 40, 0.98);
    }

    .badge-icon {
        font-size: 14px;
    }

    .badge-title {
        font-weight: bold;
    }

    .badge-count {
        color: #e74c3c;
        font-size: 12px;
    }

    .debug-console-panel {
        width: 850px;
        height: 320px;
        background-color: #121214;
        border: 1px solid #2a2a30;
        border-radius: 12px;
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.7);
        overflow: hidden;
    }

    .debug-console-header {
        background-color: #1a1a20;
        padding: 8px 14px;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1px solid #2a2a30;
    }

    .header-left {
        align-items: center;
        gap: 8px;
    }

    .header-title {
        color: #ffffff;
        font-weight: bold;
        font-size: 13px;
    }

    .logs-count {
        color: #888;
        font-size: 11px;
    }

    .filter-tabs {
        gap: 4px;
        background-color: #121214;
        padding: 3px;
        border-radius: 6px;
    }

    .tab-btn {
        background: transparent;
        border: none;
        color: #888;
        padding: 3px 8px;
        font-size: 11px;
        border-radius: 4px;
        cursor: pointer;
    }

    .tab-btn.active {
        background-color: #2a2a35;
        color: #ffffff;
        font-weight: bold;
    }

    .header-right {
        align-items: center;
        gap: 10px;
    }

    .autoscroll-label {
        font-size: 11px;
        color: #aaa;
        align-items: center;
        gap: 4px;
        cursor: pointer;
    }

    .action-btn {
        background: transparent;
        border: none;
        color: #aaa;
        font-size: 14px;
        cursor: pointer;
        padding: 2px 6px;
        border-radius: 4px;
    }

    .action-btn:hover {
        background-color: #2a2a35;
        color: #fff;
    }

    .debug-logs-list {
        flex: 1;
        overflow-y: auto;
        padding: 8px 12px;
        gap: 4px;
        background-color: #0c0c0e;
    }

    .empty-logs {
        height: 100%;
        align-items: center;
        justify-content: center;
        color: #555;
        font-size: 13px;
    }

    .log-entry {
        font-size: 12px;
        line-height: 1.4;
        gap: 8px;
        align-items: flex-start;
        word-break: break-all;
        padding: 2px 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.03);
    }

    .log-time {
        color: #666;
        white-space: nowrap;
    }

    .log-tag {
        font-weight: bold;
        white-space: nowrap;
    }

    .log-entry.info .log-tag {
        color: #2ecc71;
    }

    .log-entry.net .log-tag {
        color: #3498db;
    }

    .log-entry.error .log-tag {
        color: #e74c3c;
    }

    .log-entry.warn .log-tag {
        color: #f1c40f;
    }

    .log-msg {
        color: #dddddd;
    }

    .log-data {
        color: #888888;
        font-size: 11px;
    }
</style>

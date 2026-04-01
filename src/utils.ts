import vscode from 'vscode';

let abortController: AbortController | null = null;

export async function handleFetch(msg: any, panel: vscode.WebviewPanel) {
    if (abortController) {
        abortController.abort();
    }

    abortController = new AbortController();
    const signal = abortController.signal;
    const isCancelled = () => signal.aborted;

    try {
        const session = vscode.debug.activeDebugSession;
        if (!session) {
            throw new Error("No active debug session!");
        }

        if (isCancelled()) {
            return;
        }

        const threads = await session.customRequest('threads');
        const threadId = threads.threads[0].id;

        if (isCancelled()) {
            return;
        }

        const stack = await session.customRequest('stackTrace', {
            threadId,
            startFrame: 0,
            levels: 1
        });
        const frameId = stack.stackFrames[0].id;

        if (isCancelled()) {
            return;
        }

        const getValue = async (expr: string) => {
            const res = await session.customRequest('evaluate', {
                expression: expr,
                frameId,
                context: 'watch'
            });
            return res.result;
        };

        const getPtr = async (expr: string) => {
            const res = await session.customRequest('evaluate', {
                expression: expr,
                frameId,
                context: 'watch'
            });
            return res.memoryReference;
        };

        const width = parseInt(await getValue(msg.widthExpr));
        const height = parseInt(await getValue(msg.heightExpr));
        const channels = parseInt(await getValue(msg.channels));
        const datatype = msg.datatype || 'uint8';
        const typeSize = msg.typeSize || 1;
        const count = width * height * channels * typeSize;

        if (isNaN(count) || count <= 0) {
            throw new Error("Invalid image dimensions");
        }

        if (isCancelled()) {
            return;
        }

        const rowsPerChunk = 100;
        const bytesPerRow = width * channels * typeSize;
        const maxChunkSize = bytesPerRow * rowsPerChunk;

        for (let i = 0; i < count; i += maxChunkSize) {
            const currentReadSize = Math.min(maxChunkSize, count - i);

            const elementOffset = i / typeSize;
            const pointerStr = (await getPtr(`${msg.pointerExpr} + ${elementOffset}`) || '0');

            if (isCancelled()) { return; }

            const memory = await session.customRequest('readMemory', {
                memoryReference: pointerStr,
                count: currentReadSize
            });

            const uint8Array = new Uint8Array(Buffer.from(memory.data, 'base64'));

            panel.webview.postMessage({
                command: 'render',
                memory: uint8Array.buffer,
                width,
                height,
                channels,
                datatype,
                typeSize,
                // StartRow tells the webview where to begin drawing this block
                startRow: Math.floor(i / bytesPerRow),
                totalChunks: Math.ceil(count / maxChunkSize),
                requestID: msg.requestID
            });
        }

    } catch (err: any) {
        if (!signal.aborted) {
            panel.webview.postMessage({ command: 'error', message: err.message || String(err), requestID: msg.requestID });
        }
    }
    abortController = null;
}

export async function handlePause(msg: any, panel: vscode.WebviewPanel) {
    const session = vscode.debug.activeDebugSession;
    await session?.customRequest('pause');
}
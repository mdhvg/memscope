import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class MemScopePanel {
  public static currentPanel: MemScopePanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private disposables: vscode.Disposable[] = [];
  private currentRequestId: number = 0;
  private abortController: AbortController | null = null;

  public static createOrShow(context: vscode.ExtensionContext) {
    const column = vscode.ViewColumn.Beside;

    if (MemScopePanel.currentPanel) {
      MemScopePanel.currentPanel.panel.reveal(column);
    } else {
      const panel = vscode.window.createWebviewPanel(
        'memScope',
        'MemScope',
        column,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')]
        }
      );

      const htmlPath = path.join(context.extensionPath, 'media', 'panel.html');
      let html = fs.readFileSync(htmlPath, 'utf8');
      const baseUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media'));
      html = html.replace(/{{baseUri}}/g, baseUri.toString());

      panel.webview.html = html;

      MemScopePanel.currentPanel = new MemScopePanel(panel, context);
    }
  }

  constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
    this.panel = panel;
    this.extensionUri = context.extensionUri;

    this.panel.webview.onDidReceiveMessage(this.handleMessage.bind(this), null, this.disposables);
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  private async handleMessage(msg: any) {
    if (msg.command === 'fetch') {
      // Cancel previous request
      if (this.abortController) {
        this.abortController.abort();
      }

      this.abortController = new AbortController();
      const signal = this.abortController.signal;
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

          this.panel.webview.postMessage({
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
          this.panel.webview.postMessage({ command: 'error', message: err.message || String(err), requestID: msg.requestID });
        }
      }
      this.abortController = null;
    }
  }

  public dispose() {
    MemScopePanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}

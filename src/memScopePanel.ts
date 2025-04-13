import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class MemScopePanel {
  public static currentPanel: MemScopePanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private disposables: vscode.Disposable[] = [];

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
      try {
        const session = vscode.debug.activeDebugSession;
        if (!session) { throw new Error("No active debug session!"); }

        const threads = await session.customRequest('threads');
        const threadId = threads.threads[0].id;

        const stack = await session.customRequest('stackTrace', {
          threadId,
          startFrame: 0,
          levels: 1
        });
        const frameId = stack.stackFrames[0].id;

        const evaluate = async (expr: string) => {
          const res = await session.customRequest('evaluate', {
            expression: expr,
            frameId,
            context: 'watch'
          });
          return res.result;
        };

        const width = parseInt(await evaluate(msg.widthExpr));
        const height = parseInt(await evaluate(msg.heightExpr));
        const pointerStr = (await evaluate(msg.pointerExpr)).split(" ")[0];
        const channels = parseInt(msg.channels || '1');
        const count = width * height * channels;

        if (pointerStr === '-var-create:') { throw new Error("Invalid pointer"); }
        if (isNaN(count) || count <= 0) { throw new Error("Invalid image dimensions"); }

        console.log({ pointerStr, width, height, channels, count });

        const memory = await session.customRequest('readMemory', {
          memoryReference: pointerStr,
          count
        });

        const raw = Buffer.from(memory.data, 'base64');

        this.panel.webview.postMessage({
          command: 'render',
          buffer: [...raw],
          width,
          height,
          channels
        });

      } catch (err: any) {
        this.panel.webview.postMessage({ command: 'error', message: err.message || String(err) });
      }
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

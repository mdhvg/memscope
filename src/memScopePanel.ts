import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { handleFetch, handlePause } from './utils';

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
    switch (msg.command) {
      case 'fetch':
        handleFetch(msg, this.panel);
        break;
      case 'pause':
        handlePause(msg, this.panel);
        break;
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

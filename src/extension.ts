import * as vscode from 'vscode';
import { MemScopePanel } from './memScopePanel';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerCommand('memscope.openPanel', () => {
			MemScopePanel.createOrShow(context);
		})
	);
}

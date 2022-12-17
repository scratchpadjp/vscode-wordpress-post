import * as vscode from "vscode";
import { Context } from "./context";
import { post } from "./post";

export function activate(context: vscode.ExtensionContext) {
  // Application Context
  const appContext = new Context(context);
  appContext.debug("activate");

  let disposable = vscode.commands.registerCommand(
    "wordpress-post.post",
    async () => {
      vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Posting to WordPress (" + appContext.getSiteUrl() + ")" 
      }, async (progress) => {

        try {
          await post(appContext);
        } catch (e: any) {
          vscode.window.showErrorMessage(e.message);
        }

      });
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {}

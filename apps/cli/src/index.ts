#!/usr/bin/env node
import { Command } from "commander";
import type { WorkspaceNode } from "@rumi/contracts";
import { startRumiServer } from "@rumi/server";
import { WorkspaceRuntime } from "@rumi/runtime";

const program = new Command();

program.name("rumi").description("Rumi workspace server CLI").version("0.0.0");

program
  .command("status")
  .argument("<workspace>", "Workspace directory")
  .option("--json", "Print JSON")
  .action(async (workspace: string, options: { json?: boolean }) => {
    const runtime = await WorkspaceRuntime.open({ rootPath: workspace });
    const info = runtime.info();

    if (options.json) {
      console.log(JSON.stringify(info, null, 2));
      return;
    }

    console.log(`Workspace: ${info.name}`);
    console.log(`Root: ${info.rootPath}`);
  });

program
  .command("tree")
  .argument("<workspace>", "Workspace directory")
  .option("--json", "Print JSON")
  .action(async (workspace: string, options: { json?: boolean }) => {
    const runtime = await WorkspaceRuntime.open({ rootPath: workspace });
    const tree = await runtime.getTree();

    if (options.json) {
      console.log(JSON.stringify(tree, null, 2));
      return;
    }

    printTree(tree);
  });

program
  .command("page")
  .argument("<workspace>", "Workspace directory")
  .argument("<path>", "Workspace-relative page path")
  .option("--json", "Print JSON")
  .action(async (workspace: string, pagePath: string, options: { json?: boolean }) => {
    const runtime = await WorkspaceRuntime.open({ rootPath: workspace });
    const page = await runtime.openPage(pagePath);

    if (options.json) {
      console.log(JSON.stringify(page, null, 2));
      return;
    }

    console.log(page.markdownBody);
  });

program
  .command("index")
  .argument("<workspace>", "Workspace directory")
  .option("--json", "Print JSON")
  .action(async (workspace: string, options: { json?: boolean }) => {
    const runtime = await WorkspaceRuntime.open({ rootPath: workspace });
    const result = await runtime.rebuildIndex();

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log(`Index status: ${result.status}`);
    console.log(`Indexed at: ${result.indexedAt}`);
  });

program
  .command("reconcile")
  .argument("<workspace>", "Workspace directory")
  .option("--json", "Print JSON")
  .action(async (workspace: string, options: { json?: boolean }) => {
    const runtime = await WorkspaceRuntime.open({ rootPath: workspace });
    const result = await runtime.reconcileWorkspace();

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log(`Reconcile status: ${result.status}`);
    console.log(`Reconciled at: ${result.reconciledAt}`);
    console.log(`Events: ${result.events.length}`);
  });

program
  .command("serve")
  .argument("<workspace>", "Workspace directory")
  .option("--host <host>", "Host to bind", "127.0.0.1")
  .option("--port <port>", "Port to bind", "3000")
  .option("--verbose", "Print key workspace/API events")
  .option("--log-level <level>", "Set server log level")
  .option("--json-logs", "Print structured JSON logs instead of pretty logs")
  .action(async (workspace: string, options: { host: string; port: string; verbose?: boolean; logLevel?: string; jsonLogs?: boolean }) => {
    const started = await startRumiServer({
      workspacePath: workspace,
      host: options.host,
      port: Number(options.port),
      logLevel: resolveLogLevel(options.logLevel, options.verbose ?? false),
      prettyLogs: !options.jsonLogs
    });

    console.log(`Rumi server listening at ${started.url}`);
  });

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});

function printTree(node: WorkspaceNode, depth = 0): void {
  console.log(`${"  ".repeat(depth)}${node.name} (${node.kind})`);

  for (const child of node.children ?? []) {
    printTree(child, depth + 1);
  }
}

function resolveLogLevel(value: string | undefined, verbose: boolean): "silent" | "fatal" | "error" | "warn" | "info" | "debug" | "trace" {
  const level = value ?? (verbose ? "info" : "warn");
  const allowed = ["silent", "fatal", "error", "warn", "info", "debug", "trace"] as const;

  if (!allowed.includes(level as (typeof allowed)[number])) {
    throw new Error(`Invalid log level: ${level}`);
  }

  return level as (typeof allowed)[number];
}

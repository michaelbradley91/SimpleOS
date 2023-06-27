/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as path from 'path';
import { workspace, ExtensionContext, commands, window } from 'vscode';

import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	TransportKind
} from 'vscode-languageclient/node';
import { get_file_lines_from_filesystem, set_get_file_lines } from '../../server/src/compiler/src/syntax';
import { compile, output_binary } from '../../server/src/compiler/src/compiler';
import { print_process_file_result } from '../../server/src/compiler/src/semantics';

let client: LanguageClient;

export function activate(context: ExtensionContext) {
	// The server is implemented in node
	const serverModule = context.asAbsolutePath(
		path.join('server', 'out', 'server.js')
	);

	const compiler_channel = window.createOutputChannel("Simple OS Compiler");

	// If the extension is launched in debug mode then the debug server options are used
	// Otherwise the run options are used
	const serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: {
			module: serverModule,
			transport: TransportKind.ipc,
		}
	};

	// Options to control the language client
	const clientOptions: LanguageClientOptions = {
		// Register the server for plain text documents
		documentSelector: [{ scheme: 'file', language: 'sos' }],
		synchronize: {
			// Notify the server about file changes to '.clientrc files contained in the workspace
			fileEvents: workspace.createFileSystemWatcher('**/.clientrc')
		},
		outputChannel: compiler_channel
	};

	// Create the language client and start the client.
	client = new LanguageClient(
		'simpleOS',
		'Simple OS',
		serverOptions,
		clientOptions
	);

	const command = 'simpleOS.build';

	const commandHandler = () => {
		const program_configuration: string = workspace.getConfiguration().get("simpleOS.program_configuration");
		if (!program_configuration || program_configuration.length == 0)
		{
			compiler_channel.appendLine("Please set location of program configuration before compiling");
		}
		else
		{
			// Use the filesystem for path resolution
			if(workspace.workspaceFolders !== undefined)
			{
				set_get_file_lines(get_file_lines_from_filesystem);
				const parsed_config_path = path.parse(path.join(workspace.workspaceFolders[0].uri.fsPath, program_configuration));
				const file_path = path.join(parsed_config_path.dir, parsed_config_path.name);
				const result = compile(file_path);
				
				print_process_file_result(result.program_header, result.process_file_result, compiler_channel.appendLine);
				compiler_channel.appendLine("");
				
				if (result.process_file_result.success)
				{
					const file_path_parsed = path.parse(file_path);
					const out_file_path = path.join(file_path_parsed.dir, file_path_parsed.name + ".sox");
					const output_result = output_binary(result, out_file_path);
					if (output_result)
					{
						compiler_channel.appendLine("Saved executable to: " + out_file_path);
					}
					else
					{
						compiler_channel.appendLine("Failed to save executable.");
					}
				}
			}
			else
			{
				compiler_channel.appendLine("Please open a folder containing the configuration for the program");
			}
		}
	};

	context.subscriptions.push(commands.registerCommand(command, commandHandler));

	// Start the client. This will also launch the server
	client.start();
	compiler_channel.show();
}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}

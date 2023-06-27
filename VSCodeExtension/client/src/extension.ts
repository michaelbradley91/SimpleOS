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
import { parse_program_header } from '../../server/src/compiler/src/configuration';

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
				let config_path = program_configuration;
				if (!path.isAbsolute(program_configuration))
				{
					config_path = path.join(workspace.workspaceFolders[0].uri.fsPath, program_configuration);
				}
				const program_header = parse_program_header(config_path);

				// Fix up the working directory
				if (!path.isAbsolute(program_header.working_directory))
				{
					program_header.working_directory = path.join(workspace.workspaceFolders[0].uri.fsPath, program_header.working_directory);
				}
				if (!path.isAbsolute(program_header.output_file))
				{
					program_header.output_file = path.join(workspace.workspaceFolders[0].uri.fsPath, program_header.output_file);
				}
				if (!path.isAbsolute(program_header.main))
				{
					program_header.main = path.join(workspace.workspaceFolders[0].uri.fsPath, program_header.main);
				}
				const result = compile(program_header);
				
				print_process_file_result(result.program_header, result.process_file_result, compiler_channel.appendLine);
				compiler_channel.appendLine("");
				
				if (result.process_file_result.success)
				{
					const output_result = output_binary(result, result.program_header.output_file);
					if (output_result)
					{
						compiler_channel.appendLine("Saved executable to: " + result.program_header.output_file);
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

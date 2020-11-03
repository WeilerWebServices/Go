/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Modification copyright 2020 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import * as path from 'path';
import { commands } from 'vscode';
import vscode = require('vscode');
import { extensionId } from './const';
import { browsePackages } from './goBrowsePackage';
import { buildCode } from './goBuild';
import { check, notifyIfGeneratedFile, removeTestStatus } from './goCheck';
import {
	applyCodeCoverage, applyCodeCoverageToAllEditors, initCoverageDecorators, removeCodeCoverageOnFileSave,
	toggleCoverageCurrentPackage, trackCodeCoverageRemovalOnFileChange, updateCodeCoverageDecorators
} from './goCover';
import { GoDebugConfigurationProvider } from './goDebugConfiguration';
import { extractFunction, extractVariable } from './goDoctor';
import { toolExecutionEnvironment } from './goEnv';
import { chooseGoEnvironment, offerToInstallLatestGoVersion, setEnvironmentVariableCollection } from './goEnvironmentStatus';
import { runFillStruct } from './goFillStruct';
import * as goGenerateTests from './goGenerateTests';
import { goGetPackage } from './goGetPackage';
import { implCursor } from './goImpl';
import { addImport, addImportToWorkspace } from './goImport';
import { installCurrentPackage } from './goInstall';
import {
	installAllTools, installTools, offerToInstallTools, promptForMissingTool,
	updateGoVarsFromConfig
} from './goInstallTools';
import {
	isNightly,
	languageServerIsRunning,
	promptForLanguageServerDefaultChange,
	resetSurveyConfig,
	showServerOutputChannel,
	showSurveyConfig,
	startLanguageServerWithFallback, timeMinute, watchLanguageServerConfiguration
} from './goLanguageServer';
import { lintCode } from './goLint';
import { logVerbose, setLogConfig } from './goLogging';
import { GO_MODE } from './goMode';
import { addTags, removeTags } from './goModifytags';
import { GO111MODULE, isModSupported } from './goModules';
import { playgroundCommand } from './goPlayground';
import { GoReferencesCodeLensProvider } from './goReferencesCodelens';
import { GoRunTestCodeLensProvider } from './goRunTestCodelens';
import { disposeGoStatusBar, expandGoStatusBar, outputChannel, updateGoStatusBar } from './goStatus';
import { subTestAtCursor, testAtCursor, testCurrentFile, testCurrentPackage, testPrevious, testWorkspace } from './goTest';
import { getConfiguredTools } from './goTools';
import { vetCode } from './goVet';
import {
	getFromGlobalState, getFromWorkspaceState, setGlobalState, setWorkspaceState, updateGlobalState,
	updateWorkspaceState
} from './stateUtils';
import { cancelRunningTests, showTestOutput } from './testUtils';
import {
	cleanupTempDir,
	getBinPath,
	getCurrentGoPath,
	getExtensionCommands,
	getGoConfig,
	getGoEnv,
	getGoVersion,
	getToolsGopath,
	getWorkspaceFolderPath,
	handleDiagnosticErrors,
	isGoPathSet,
	resolvePath,
} from './util';
import { clearCacheForTools, fileExists, getCurrentGoRoot, setCurrentGoRoot } from './utils/pathUtils';

export let buildDiagnosticCollection: vscode.DiagnosticCollection;
export let lintDiagnosticCollection: vscode.DiagnosticCollection;
export let vetDiagnosticCollection: vscode.DiagnosticCollection;

// restartLanguageServer wraps all of the logic needed to restart the
// language server. It can be used to enable, disable, or otherwise change
// the configuration of the server.
export let restartLanguageServer = () => { return; };

export function activate(ctx: vscode.ExtensionContext) {
	const cfg = getGoConfig();
	setLogConfig(cfg['logging']);

	setGlobalState(ctx.globalState);
	setWorkspaceState(ctx.workspaceState);
	setEnvironmentVariableCollection(ctx.environmentVariableCollection);

	if (isNightly()) {
		promptForLanguageServerDefaultChange(cfg);

		// For Nightly extension users, show a message directing them to forums
		// to give feedback.
		setTimeout(showGoNightlyWelcomeMessage, 10 * timeMinute);
	}

	const configGOROOT = getGoConfig()['goroot'];
	if (!!configGOROOT) {
		logVerbose(`go.goroot = '${configGOROOT}'`);
		setCurrentGoRoot(resolvePath(configGOROOT));
	}

	updateGoVarsFromConfig().then(async () => {
		suggestUpdates(ctx);
		offerToInstallLatestGoVersion();
		offerToInstallTools();
		configureLanguageServer(ctx);

		if (
			vscode.window.activeTextEditor &&
			vscode.window.activeTextEditor.document.languageId === 'go' &&
			isGoPathSet()
		) {
			// Check mod status so that cache is updated and then run build/lint/vet
			// TODO(hyangah): skip if the language server is used (it will run build too)
			isModSupported(vscode.window.activeTextEditor.document.uri).then(() => {
				runBuilds(vscode.window.activeTextEditor.document, getGoConfig());
			});
		}
	});

	initCoverageDecorators(ctx);

	ctx.subscriptions.push(
		vscode.commands.registerCommand('go.environment.status', async () => {
			expandGoStatusBar();
		})
	);
	const testCodeLensProvider = new GoRunTestCodeLensProvider();
	const referencesCodeLensProvider = new GoReferencesCodeLensProvider();

	ctx.subscriptions.push(vscode.languages.registerCodeLensProvider(GO_MODE, testCodeLensProvider));
	ctx.subscriptions.push(vscode.languages.registerCodeLensProvider(GO_MODE, referencesCodeLensProvider));

	// debug
	ctx.subscriptions.push(
		vscode.debug.registerDebugConfigurationProvider('go', new GoDebugConfigurationProvider('go')));
	ctx.subscriptions.push(
		vscode.debug.registerDebugConfigurationProvider('godlvdap', new GoDebugConfigurationProvider('godlvdap')));

	buildDiagnosticCollection = vscode.languages.createDiagnosticCollection('go');
	ctx.subscriptions.push(buildDiagnosticCollection);
	lintDiagnosticCollection = vscode.languages.createDiagnosticCollection('go-lint');
	ctx.subscriptions.push(lintDiagnosticCollection);
	vetDiagnosticCollection = vscode.languages.createDiagnosticCollection('go-vet');
	ctx.subscriptions.push(vetDiagnosticCollection);

	addOnChangeTextDocumentListeners(ctx);
	addOnChangeActiveTextEditorListeners(ctx);
	addOnSaveTextDocumentListeners(ctx);

	ctx.subscriptions.push(
		vscode.commands.registerCommand('go.gopath', () => {
			getCurrentGoPathCommand();
		}));

	ctx.subscriptions.push(
		vscode.commands.registerCommand('go.locate.tools', async () => {
			getConfiguredGoToolsCommand();
		}));

	ctx.subscriptions.push(
		vscode.commands.registerCommand('go.add.tags', (args) => {
			addTags(args);
		})
	);

	ctx.subscriptions.push(
		vscode.commands.registerCommand('go.remove.tags', (args) => {
			removeTags(args);
		})
	);

	ctx.subscriptions.push(
		vscode.commands.registerCommand('go.fill.struct', () => {
			runFillStruct(vscode.window.activeTextEditor);
		})
	);

	ctx.subscriptions.push(
		vscode.commands.registerCommand('go.impl.cursor', () => {
			implCursor();
		})
	);
	ctx.subscriptions.push(
		vscode.commands.registerCommand('go.godoctor.extract', () => {
			extractFunction();
		})
	);
	ctx.subscriptions.push(
		vscode.commands.registerCommand('go.godoctor.var', () => {
			extractVariable();
		})
	);

	ctx.subscriptions.push(
		vscode.commands.registerCommand('go.test.cursor', (args) => {
			const goConfig = getGoConfig();
			testAtCursor(goConfig, 'test', args);
		})
	);

	ctx.subscriptions.push(
		vscode.commands.registerCommand('go.subtest.cursor', (args) => {
			const goConfig = getGoConfig();
			subTestAtCursor(goConfig, args);
		})
	);

	ctx.subscriptions.push(
		vscode.commands.registerCommand('go.debug.cursor', (args) => {
			if (vscode.debug.activeDebugSession) {
				vscode.window.showErrorMessage('Debug session has already been started.');
				return;
			}
			const goConfig = getGoConfig();
			testAtCursor(goConfig, 'debug', args);
		})
	);

	ctx.subscriptions.push(
		vscode.commands.registerCommand('go.benchmark.cursor', (args) => {
			const goConfig = getGoConfig();
			testAtCursor(goConfig, 'benchmark', args);
		})
	);

	ctx.subscriptions.push(
		vscode.commands.registerCommand('go.test.package', (args) => {
			const goConfig = getGoConfig();
			const isBenchmark = false;
			testCurrentPackage(goConfig, isBenchmark, args);
		})
	);

	ctx.subscriptions.push(
		vscode.commands.registerCommand('go.benchmark.package', (args) => {
			const goConfig = getGoConfig();
			const isBenchmark = true;
			testCurrentPackage(goConfig, isBenchmark, args);
		})
	);

	ctx.subscriptions.push(
		vscode.commands.registerCommand('go.test.file', (args) => {
			const goConfig = getGoConfig();
			const isBenchmark = false;
			testCurrentFile(goConfig, isBenchmark, args);
		})
	);

	ctx.subscriptions.push(
		vscode.commands.registerCommand('go.benchmark.file', (args) => {
			const goConfig = getGoConfig();
			const isBenchmark = true;
			testCurrentFile(goConfig, isBenchmark, args);
		})
	);

	ctx.subscriptions.push(
		vscode.commands.registerCommand('go.test.workspace', (args) => {
			const goConfig = getGoConfig();
			testWorkspace(goConfig, args);
		})
	);

	ctx.subscriptions.push(
		vscode.commands.registerCommand('go.test.previous', () => {
			testPrevious();
		})
	);

	ctx.subscriptions.push(
		vscode.commands.registerCommand('go.test.coverage', () => {
			toggleCoverageCurrentPackage();
		})
	);

	ctx.subscriptions.push(
		vscode.commands.registerCommand('go.test.showOutput', () => {
			showTestOutput();
		})
	);

	ctx.subscriptions.push(
		vscode.commands.registerCommand('go.test.cancel', () => {
			cancelRunningTests();
		})
	);

	ctx.subscriptions.push(
		vscode.commands.registerCommand('go.import.add', (arg) => {
			return addImport(arg);
		})
	);

	ctx.subscriptions.push(
		vscode.commands.registerCommand('go.add.package.workspace', () => {
			addImportToWorkspace();
		})
	);

	ctx.subscriptions.push(
		vscode.commands.registerCommand('go.tools.install', async (args) => {
			if (Array.isArray(args) && args.length) {
				const goVersion = await getGoVersion();
				await installTools(args, goVersion);
				return;
			}
			installAllTools();
		})
	);

	ctx.subscriptions.push(
		vscode.commands.registerCommand('go.browse.packages', () => {
			browsePackages();
		})
	);

	ctx.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((e: vscode.ConfigurationChangeEvent) => {
			if (!e.affectsConfiguration('go')) {
				return;
			}
			const updatedGoConfig = getGoConfig();

			if (e.affectsConfiguration('go.goroot') ||
				e.affectsConfiguration('go.alternateTools') ||
				e.affectsConfiguration('go.gopath') ||
				e.affectsConfiguration('go.toolsEnvVars') ||
				e.affectsConfiguration('go.testEnvFile')) {
				updateGoVarsFromConfig();
			}
			if (e.affectsConfiguration('go.logging')) {
				setLogConfig(updatedGoConfig['logging']);
			}
			// If there was a change in "toolsGopath" setting, then clear cache for go tools
			if (getToolsGopath() !== getToolsGopath(false)) {
				clearCacheForTools();
			}

			if (updatedGoConfig['enableCodeLens']) {
				testCodeLensProvider.setEnabled(updatedGoConfig['enableCodeLens']['runtest']);
				referencesCodeLensProvider.setEnabled(updatedGoConfig['enableCodeLens']['references']);
			}

			if (e.affectsConfiguration('go.formatTool')) {
				checkToolExists(updatedGoConfig['formatTool']);
			}
			if (e.affectsConfiguration('go.lintTool')) {
				checkToolExists(updatedGoConfig['lintTool']);
			}
			if (e.affectsConfiguration('go.docsTool')) {
				checkToolExists(updatedGoConfig['docsTool']);
			}
			if (e.affectsConfiguration('go.coverageDecorator')) {
				updateCodeCoverageDecorators(updatedGoConfig['coverageDecorator']);
			}
			if (e.affectsConfiguration('go.toolsEnvVars')) {
				const env = toolExecutionEnvironment();
				if (GO111MODULE !== env['GO111MODULE']) {
					const reloadMsg =
						'Reload VS Code window so that the Go tools can respect the change to GO111MODULE';
					vscode.window.showInformationMessage(reloadMsg, 'Reload').then((selected) => {
						if (selected === 'Reload') {
							vscode.commands.executeCommand('workbench.action.reloadWindow');
						}
					});
				}
			}
		})
	);

	ctx.subscriptions.push(
		vscode.commands.registerCommand('go.test.generate.package', () => {
			goGenerateTests.generateTestCurrentPackage();
		})
	);

	ctx.subscriptions.push(
		vscode.commands.registerCommand('go.test.generate.file', () => {
			goGenerateTests.generateTestCurrentFile();
		})
	);

	ctx.subscriptions.push(
		vscode.commands.registerCommand('go.test.generate.function', () => {
			goGenerateTests.generateTestCurrentFunction();
		})
	);

	ctx.subscriptions.push(
		vscode.commands.registerCommand('go.toggle.test.file', () => {
			goGenerateTests.toggleTestFile();
		})
	);

	ctx.subscriptions.push(
		vscode.commands.registerCommand('go.debug.startSession', (config) => {
			let workspaceFolder;
			if (vscode.window.activeTextEditor) {
				workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri);
			}

			return vscode.debug.startDebugging(workspaceFolder, config);
		})
	);

	ctx.subscriptions.push(
		vscode.commands.registerCommand('go.show.commands', () => {
			const extCommands = getExtensionCommands();
			extCommands.push({
				command: 'editor.action.goToDeclaration',
				title: 'Go to Definition'
			});
			extCommands.push({
				command: 'editor.action.goToImplementation',
				title: 'Go to Implementation'
			});
			extCommands.push({
				command: 'workbench.action.gotoSymbol',
				title: 'Go to Symbol in File...'
			});
			extCommands.push({
				command: 'workbench.action.showAllSymbols',
				title: 'Go to Symbol in Workspace...'
			});
			vscode.window.showQuickPick(extCommands.map((x) => x.title)).then((cmd) => {
				const selectedCmd = extCommands.find((x) => x.title === cmd);
				if (selectedCmd) {
					vscode.commands.executeCommand(selectedCmd.command);
				}
			});
		})
	);

	ctx.subscriptions.push(vscode.commands.registerCommand('go.get.package', goGetPackage));

	ctx.subscriptions.push(vscode.commands.registerCommand('go.playground', playgroundCommand));

	ctx.subscriptions.push(vscode.commands.registerCommand('go.lint.package', () => lintCode('package')));

	ctx.subscriptions.push(vscode.commands.registerCommand('go.lint.workspace', () => lintCode('workspace')));

	ctx.subscriptions.push(vscode.commands.registerCommand('go.lint.file', () => lintCode('file')));

	ctx.subscriptions.push(vscode.commands.registerCommand('go.vet.package', vetCode));

	ctx.subscriptions.push(vscode.commands.registerCommand('go.vet.workspace', () => vetCode(true)));

	ctx.subscriptions.push(vscode.commands.registerCommand('go.build.package', buildCode));

	ctx.subscriptions.push(vscode.commands.registerCommand('go.build.workspace', () => buildCode(true)));

	ctx.subscriptions.push(vscode.commands.registerCommand('go.install.package', installCurrentPackage));

	ctx.subscriptions.push(vscode.commands.registerCommand('go.extractServerChannel', () => {
		showServerOutputChannel();
	}));

	ctx.subscriptions.push(vscode.commands.registerCommand('go.toggle.gc_details', () => {
		if (!languageServerIsRunning) {
			vscode.window.showErrorMessage('"Go: Toggle gc details" command is available only when the language server is running');
			return;
		}
		const doc = vscode.window.activeTextEditor?.document.uri.toString();
		if (!doc || !doc.endsWith('.go')) {
			vscode.window.showErrorMessage('"Go: Toggle gc details" command cannot run when no Go file is open.');
			return;
		}
		vscode.commands.executeCommand('gc_details', doc)
			.then(undefined, (reason0) => {
				vscode.commands.executeCommand('gopls.gc_details', doc)
					.then(undefined, (reason1) => {
						vscode.window.showErrorMessage(`"Go: Toggle gc details" command failed: gc_details:${reason0} gopls_gc_details:${reason1}`);
					});
			});
	}));

	ctx.subscriptions.push(
		vscode.commands.registerCommand('go.apply.coverprofile', () => {
			if (!vscode.window.activeTextEditor || !vscode.window.activeTextEditor.document.fileName.endsWith('.go')) {
				vscode.window.showErrorMessage('Cannot apply coverage profile when no Go file is open.');
				return;
			}
			const lastCoverProfilePathKey = 'lastCoverProfilePathKey';
			const lastCoverProfilePath = getFromWorkspaceState(lastCoverProfilePathKey, '');
			vscode.window
				.showInputBox({
					prompt: 'Enter the path to the coverage profile for current package',
					value: lastCoverProfilePath
				})
				.then((coverProfilePath) => {
					if (!coverProfilePath) {
						return;
					}
					if (!fileExists(coverProfilePath)) {
						vscode.window.showErrorMessage(`Cannot find the file ${coverProfilePath}`);
						return;
					}
					if (coverProfilePath !== lastCoverProfilePath) {
						updateWorkspaceState(lastCoverProfilePathKey, coverProfilePath);
					}
					applyCodeCoverageToAllEditors(
						coverProfilePath, getWorkspaceFolderPath(vscode.window.activeTextEditor.document.uri)
					);
				});
		})
	);

	// Go Enviornment switching commands
	ctx.subscriptions.push(
		vscode.commands.registerCommand('go.environment.choose', () => {
			chooseGoEnvironment();
		})
	);

	// Survey related commands
	ctx.subscriptions.push(
		vscode.commands.registerCommand('go.survey.showConfig', () => showSurveyConfig()));
	ctx.subscriptions.push(
		vscode.commands.registerCommand('go.survey.resetConfig', () => resetSurveyConfig()));

	vscode.languages.setLanguageConfiguration(GO_MODE.language, {
		wordPattern: /(-?\d*\.\d\w*)|([^\`\~\!\@\#\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g
	});
}

async function showGoNightlyWelcomeMessage() {
	const shown = getFromGlobalState(goNightlyPromptKey, false);
	if (shown === true) {
		return;
	}
	const prompt = async () => {
		const selected = await vscode.window.showInformationMessage(`Thank you for testing new features by using the Go Nightly extension!
We'd like to welcome you to share feedback and/or join our community of Go Nightly users and developers.`, 'Share feedback', 'Community resources');
		switch (selected) {
			case 'Share feedback':
				await vscode.env.openExternal(vscode.Uri.parse('https://github.com/golang/vscode-go/blob/master/docs/nightly.md#feedback'));
				break;
			case 'Community resources':
				await vscode.env.openExternal(vscode.Uri.parse('https://github.com/golang/vscode-go/blob/master/docs/nightly.md#community'));
				break;
			default:
				return;
		}
		// Only prompt again if the user clicked one of the buttons.
		// They may want to look at the other option.
		prompt();
	};
	prompt();

	// Update state to indicate that we've shown this message to the user.
	updateGlobalState(goNightlyPromptKey, true);
}

const goNightlyPromptKey = 'goNightlyPrompt';

export function deactivate() {
	return Promise.all([
		cancelRunningTests(),
		Promise.resolve(cleanupTempDir()),
		Promise.resolve(disposeGoStatusBar())]);
}

function runBuilds(document: vscode.TextDocument, goConfig: vscode.WorkspaceConfiguration) {
	if (document.languageId !== 'go') {
		return;
	}

	buildDiagnosticCollection.clear();
	lintDiagnosticCollection.clear();
	vetDiagnosticCollection.clear();
	check(document.uri, goConfig)
		.then((results) => {
			results.forEach((result) => {
				handleDiagnosticErrors(document, result.errors, result.diagnosticCollection);
			});
		})
		.catch((err) => {
			vscode.window.showInformationMessage('Error: ' + err);
		});
}

function addOnSaveTextDocumentListeners(ctx: vscode.ExtensionContext) {
	vscode.workspace.onDidSaveTextDocument(removeCodeCoverageOnFileSave, null, ctx.subscriptions);
	vscode.workspace.onDidSaveTextDocument(
		(document) => {
			if (document.languageId !== 'go') {
				return;
			}
			if (vscode.debug.activeDebugSession) {
				const neverAgain = { title: `Don't Show Again` };
				const ignoreActiveDebugWarningKey = 'ignoreActiveDebugWarningKey';
				const ignoreActiveDebugWarning = getFromGlobalState(ignoreActiveDebugWarningKey);
				if (!ignoreActiveDebugWarning) {
					vscode.window
						.showWarningMessage(
							'A debug session is currently active. Changes to your Go files may result in unexpected behaviour.',
							neverAgain
						)
						.then((result) => {
							if (result === neverAgain) {
								updateGlobalState(ignoreActiveDebugWarningKey, true);
							}
						});
				}
			}
			if (vscode.window.visibleTextEditors.some((e) => e.document.fileName === document.fileName)) {
				runBuilds(document, getGoConfig(document.uri));
			}
		},
		null,
		ctx.subscriptions
	);
}

function addOnChangeTextDocumentListeners(ctx: vscode.ExtensionContext) {
	vscode.workspace.onDidChangeTextDocument(trackCodeCoverageRemovalOnFileChange, null, ctx.subscriptions);
	vscode.workspace.onDidChangeTextDocument(removeTestStatus, null, ctx.subscriptions);
	vscode.workspace.onDidChangeTextDocument(notifyIfGeneratedFile, ctx, ctx.subscriptions);
}

function addOnChangeActiveTextEditorListeners(ctx: vscode.ExtensionContext) {
	[updateGoStatusBar, applyCodeCoverage].forEach((listener) => {
		// Call the listeners on initilization for current active text editor
		if (!!vscode.window.activeTextEditor) {
			listener(vscode.window.activeTextEditor);
		}
		vscode.window.onDidChangeActiveTextEditor(listener, null, ctx.subscriptions);
	});
}

function checkToolExists(tool: string) {
	if (tool === getBinPath(tool)) {
		promptForMissingTool(tool);
	}
}

async function suggestUpdates(ctx: vscode.ExtensionContext) {
	const updateToolsCmdText = 'Update tools';
	interface GoInfo {
		goroot: string;
		version: string;
	}
	const toolsGoInfo: { [id: string]: GoInfo } = ctx.globalState.get('toolsGoInfo') || {};
	const toolsGopath = getToolsGopath() || getCurrentGoPath();
	if (!toolsGoInfo[toolsGopath]) {
		toolsGoInfo[toolsGopath] = { goroot: null, version: null };
	}
	const prevGoroot = toolsGoInfo[toolsGopath].goroot;
	const currentGoroot: string = getCurrentGoRoot().toLowerCase();
	if (prevGoroot && prevGoroot.toLowerCase() !== currentGoroot) {
		vscode.window
			.showInformationMessage(
				`Your current goroot (${currentGoroot}) is different than before (${prevGoroot}), a few Go tools may need recompiling`,
				updateToolsCmdText
			)
			.then((selected) => {
				if (selected === updateToolsCmdText) {
					installAllTools(true);
				}
			});
	} else {
		const currentVersion = await getGoVersion();
		if (currentVersion) {
			const prevVersion = toolsGoInfo[toolsGopath].version;
			const currVersionString = currentVersion.format();

			if (prevVersion !== currVersionString) {
				if (prevVersion) {
					vscode.window
						.showInformationMessage(
							'Your Go version is different than before, a few Go tools may need re-compiling',
							updateToolsCmdText
						)
						.then((selected) => {
							if (selected === updateToolsCmdText) {
								installAllTools(true);
							}
						});
				}
				toolsGoInfo[toolsGopath].version = currVersionString;
			}
		}
	}
	toolsGoInfo[toolsGopath].goroot = currentGoroot;
	ctx.globalState.update('toolsGoInfo', toolsGoInfo);
}

function configureLanguageServer(ctx: vscode.ExtensionContext) {
	// Subscribe to notifications for changes to the configuration
	// of the language server, even if it's not currently in use.
	ctx.subscriptions.push(vscode.workspace.onDidChangeConfiguration(
		(e) => watchLanguageServerConfiguration(e)
	));

	// Set the function that is used to restart the language server.
	// This is necessary, even if the language server is not currently
	// in use.
	restartLanguageServer = async () => {
		startLanguageServerWithFallback(ctx, false);
	};

	// Start the language server, or fallback to the default language providers.
	startLanguageServerWithFallback(ctx, true);

}

function getCurrentGoPathCommand() {
	const gopath = getCurrentGoPath();
	let msg = `${gopath} is the current GOPATH.`;
	const wasInfered = getGoConfig()['inferGopath'];
	const root = getWorkspaceFolderPath(
		vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri
	);

	// not only if it was configured, but if it was successful.
	if (wasInfered && root && root.indexOf(gopath) === 0) {
		const inferredFrom = vscode.window.activeTextEditor ? 'current folder' : 'workspace root';
		msg += ` It is inferred from ${inferredFrom}`;
	}

	vscode.window.showInformationMessage(msg);
	return gopath;
}

async function getConfiguredGoToolsCommand() {
	outputChannel.show();
	outputChannel.clear();
	outputChannel.appendLine('Checking configured tools....');
	// Tool's path search is done by getBinPathWithPreferredGopath
	// which searches places in the following order
	// 1) absolute path for the alternateTool
	// 2) GOBIN
	// 3) toolsGopath
	// 4) gopath
	// 5) GOROOT
	// 6) PATH
	outputChannel.appendLine('GOBIN: ' + process.env['GOBIN']);
	outputChannel.appendLine('toolsGopath: ' + getToolsGopath());
	outputChannel.appendLine('gopath: ' + getCurrentGoPath());
	outputChannel.appendLine('GOROOT: ' + getCurrentGoRoot());
	outputChannel.appendLine('PATH: ' + process.env['PATH']);
	outputChannel.appendLine('');

	const goVersion = await getGoVersion();
	const allTools = getConfiguredTools(goVersion);

	allTools.forEach((tool) => {
		const toolPath = getBinPath(tool.name);
		// TODO(hyangah): print alternate tool info if set.
		let msg = 'not installed';
		if (path.isAbsolute(toolPath)) {
			// getBinPath returns the absolute path is the tool exists.
			// (See getBinPathWithPreferredGopath which is called underneath)
			msg = 'installed';
		}
		outputChannel.appendLine(`   ${tool.name}: ${toolPath} ${msg}`);
	});

	let folders = vscode.workspace.workspaceFolders?.map((folder) => {
		return { name: folder.name, path: folder.uri.fsPath };
	});
	if (!folders) {
		folders = [{ name: 'no folder', path: undefined }];
	}

	outputChannel.appendLine('');
	outputChannel.appendLine('go env');
	for (const folder of folders) {
		outputChannel.appendLine(`Workspace Folder (${folder.name}): ${folder.path}`);
		try {
			const out = await getGoEnv(folder.path);
			// Append '\t' to the beginning of every line (^) of 'out'.
			// 'g' = 'global matching', and 'm' = 'multi-line matching'
			outputChannel.appendLine(out.replace(/^/gm, '\t'));
		} catch (e) {
			outputChannel.appendLine(`failed to run 'go env': ${e}`);
		}
	}
}
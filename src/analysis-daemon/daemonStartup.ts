import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { exec, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import * as net from 'net';

const execAsync = promisify(exec);
let daemonProcess: ChildProcess | undefined;
let outputChannel: vscode.OutputChannel | undefined;

export async function activateAnalysisDaemon(context: vscode.ExtensionContext) {
    try {
        if (!outputChannel) {
            outputChannel = vscode.window.createOutputChannel("ExplorViz Analysis Daemon");
            context.subscriptions.push(outputChannel);
        }
        outputChannel.clear();
        outputChannel.show();

        outputChannel.appendLine("Start ExplorViz Python Daemon...");

        const pythonVenvPath = await ensurePythonEnvironment(context);
        outputChannel.appendLine(`-> Venv Python Path: ${pythonVenvPath}`);

        if (!fs.existsSync(pythonVenvPath)) {
            outputChannel.appendLine(`[CRITICAL] No Python Executable found in Virtual Environment!`);
            return;
        }

        const scriptPath = context.asAbsolutePath(path.join('src', 'analysis-daemon', 'analysis_daemon.py'));
        outputChannel.appendLine(`-> Daemon Script Path: ${scriptPath}`);

        if (!fs.existsSync(scriptPath)) {
            outputChannel.appendLine(`[CRITICAL] File 'analysis_daemon.py' was not found at specified path!`);
            return;
        }

        const freePort = await getFreePort();
        const portStr = freePort.toString();
        outputChannel.appendLine(`ExplorViz Daemon: Assigned free port ${portStr}`);

        // Save port to globalState. Maybe not necessary...
        await context.globalState.update('explorvizDaemonPort', freePort);

        outputChannel.appendLine(`-> Execute: "${pythonVenvPath}" "${scriptPath}" ${portStr}`);

        daemonProcess = spawn(pythonVenvPath, ['-u', scriptPath, portStr], {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        daemonProcess.stdout?.on('data', (data) => {
            catchDaemonOutput(data, "[DAEMON LOG]");
        });

        daemonProcess.stderr?.on('data', (data) => {
            catchDaemonOutput(data, "[DAEMON ERR]");
        });

        daemonProcess.on('exit', (code, signal) => {
            outputChannel?.appendLine(`[DAEMON EXIT] (Code: ${code}, Signal: ${signal})`);
        });
    } catch (error: any) {
        vscode.window.showErrorMessage(`An error occured during startup of ExplorViz' analysis daemon: ${error.message}`);
    }
}

export function deactivateAnalysisDaemon() {
    if (daemonProcess) {
        daemonProcess.kill();
    }
}

async function ensurePythonEnvironment(context: vscode.ExtensionContext): Promise<string> {
    const storageUri = context.globalStorageUri;

    if (!fs.existsSync(storageUri.fsPath)) {
        fs.mkdirSync(storageUri.fsPath, { recursive: true });
    }

    const venvDir = path.join(storageUri.fsPath, 'venvs', 'explorviz-env');
    const isWindows = process.platform === 'win32';

    const pythonInVenv = isWindows
        ? path.join(venvDir, 'Scripts', 'python.exe')
        : path.join(venvDir, 'bin', 'python');

    const requirementsPath = context.asAbsolutePath(path.join('src', 'analysis-daemon', 'requirements.txt'));

    if (!fs.existsSync(pythonInVenv)) {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "ExplorViz: Set up an isolated Python environment...",
            cancellable: false
        }, async (progress) => {

            progress.report({ message: "Searching for system's Python..." });
            const systemPython = await findSystemPython();

            progress.report({ message: "Create Virtual Environment..." });
            await execAsync(`"${systemPython}" -m venv "${venvDir}"`);

            progress.report({ message: "Install Python dependencies into Virtual Environment..." });

            const pipCommand = isWindows
                ? `"${path.join(venvDir, 'Scripts', 'pipCommand.exe')}"`
                : `"${path.join(venvDir, 'bin', 'pip')}"`;

            await execAsync(`${pipCommand} install --upgrade pip`);
            if (fs.existsSync(requirementsPath)) {
                await execAsync(`${pipCommand} install -r "${requirementsPath}"`);
            }
        });
    }

    return pythonInVenv;
}

async function findSystemPython(): Promise<string> {
    const candidates = process.platform === 'win32' ? ['python', 'python3', 'py'] : ['python3', 'python'];

    for (const cmd of candidates) {
        try {
            const { stdout, stderr } = await execAsync(`${cmd} --version`);
            const output = (stdout || '') + (stderr || '');

            if (output.includes('Python 3')) {
                return cmd;
            }
        } catch (err) {
            // skip
        }
    }

    throw new Error("No Python 3 interpreter was found on the system. Python3 is required for local code analysis.");
}

function getFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.listen(0, '127.0.0.1', () => {
            const address = server.address() as net.AddressInfo;
            const port = address.port;
            server.close(() => {
                resolve(port);
            });
        });
        server.on('error', (err) => {
            reject(err);
        });
    });
}

function catchDaemonOutput(data: any, messageHeader: string) {
    const text = data.toString();
    text.split(/\r?\n/).forEach((line) => {
        if (line.trim().length > 0) {
            outputChannel?.appendLine(`${messageHeader} ${line}`);
        }
    });
}
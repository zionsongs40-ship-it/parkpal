
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { NexusAgent } from "./index.js";
import { registerBasicTools } from "./tools.js";

const nexus = new NexusAgent();
const workspace = "D:/NEXUS";

registerBasicTools(nexus, workspace);

const terminal = readline.createInterface({
    input: stdin,
    output: stdout
});

console.log("\n================================");
console.log("          NEXUS TERMINAL");
console.log("================================");
console.log("Welcome! NEXUS is ready.");
console.log("Commands: /help, /status, /tools, /ls, /read, /exit\n");

nexus.remember("system", "NEXUS interactive terminal started.");

while (true) {
    const input = (await terminal.question("You > ")).trim();

    if (!input) continue;

    nexus.remember("user", input);

    try {
        if (input === "/exit") {
            console.log("NEXUS > Goodbye!");
            break;
        }

        if (input === "/help") {
            console.log(`
Available commands:

/help          Show commands
/status        Show agent status
/tools         Show available tools
/ls            List project files
/ls folder     List a specific folder
/read file     Read a project file
/exit          Exit NEXUS
`);
        }

        else if (input === "/status") {
            console.log(nexus.getStatus());
        }

        else if (input === "/tools") {
            console.log(nexus.getTools());
        }

        else if (input === "/ls" || input.startsWith("/ls ")) {
            const directory = input.slice(3).trim() || ".";

            const result = await nexus.useTool("list_files", {
                directory
            });

            console.log(result);
        }

        else if (input.startsWith("/read ")) {
            const filePath = input.slice(6).trim();

            const result = await nexus.useTool("read_file", {
                filePath
            });

            console.log("\n" + result);
        }

        else {
            console.log(
                "NEXUS > I don't understand that command yet. Type /help."
            );
        }

        nexus.remember("assistant", "Command processed: " + input);

    } catch (error) {
        console.log("NEXUS ERROR > " + error.message);
    }
}

terminal.close();

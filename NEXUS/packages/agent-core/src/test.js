
import { NexusAgent } from "./index.js";
import { registerBasicTools } from "./tools.js";

const workspace = "D:/NEXUS";

const nexus = new NexusAgent();

// Register NEXUS tools
registerBasicTools(nexus, workspace);

// Give NEXUS its first memory
nexus.remember(
    "system",
    "NEXUS initialized. Ready to assist with coding."
);

console.log("\n================================");
console.log("       NEXUS AI AGENT");
console.log("================================\n");

// Display agent status
console.log("SYSTEM STATUS:");
console.log(nexus.getStatus());

// Display available tools
console.log("\nAVAILABLE TOOLS:");
console.log(nexus.getTools());

// Explore its workspace
console.log("\nPROJECT FILES:");

const files = await nexus.useTool("list_files", {
    directory: "."
});

console.log(files);

// Display memory
console.log("\nAGENT MEMORY:");
console.log(nexus.getMemory());

console.log("\n================================");
console.log("       NEXUS IS ONLINE!");
console.log("================================\n");


export class NexusAgent {
    constructor() {
        this.name = "NEXUS";
        this.version = "1.0.0";
        this.status = "READY";

        this.memory = [];
        this.tools = new Map();

        console.log("[NEXUS] Agent engine initialized.");
    }

    remember(role, content) {
        this.memory.push({
            role,
            content,
            timestamp: new Date().toISOString()
        });
    }

    getMemory() {
        return [...this.memory];
    }

    registerTool(name, description, execute) {
        if (this.tools.has(name)) {
            throw new Error(`Tool already exists: ${name}`);
        }

        this.tools.set(name, {
            name,
            description,
            execute
        });

        console.log(`[NEXUS] Registered tool: ${name}`);
    }

    getTools() {
        return [...this.tools.values()].map(tool => ({
            name: tool.name,
            description: tool.description
        }));
    }

    async useTool(name, args = {}) {
        const tool = this.tools.get(name);

        if (!tool) {
            throw new Error(`Unknown tool: ${name}`);
        }

        console.log(`[NEXUS] Using tool: ${name}`);

        return await tool.execute(args);
    }

    getStatus() {
        return {
            name: this.name,
            version: this.version,
            status: this.status,
            memoryEntries: this.memory.length,
            registeredTools: this.tools.size
        };
    }
}

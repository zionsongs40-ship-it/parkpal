
import fs from "node:fs/promises";
import path from "node:path";

export function registerBasicTools(agent, workspaceRoot) {

    const root = path.resolve(workspaceRoot);

    async function safePath(relativePath) {
        const target = path.resolve(root, relativePath || ".");

        const realRoot = await fs.realpath(root);
        const realTarget = await fs.realpath(target);

        const relative = path.relative(realRoot, realTarget);

        if (
            relative === ".." ||
            relative.startsWith(`..${path.sep}`) ||
            path.isAbsolute(relative)
        ) {
            throw new Error("Access denied: outside workspace.");
        }

        return realTarget;
    }

    // TOOL 1: Explore project files
    agent.registerTool(
        "list_files",
        "Lists files and folders inside the project",
        async ({ directory = "." } = {}) => {

            const target = await safePath(directory);

            const entries = await fs.readdir(target, {
                withFileTypes: true
            });

            return entries
                .filter(entry =>
                    !["node_modules", ".git", ".next"].includes(entry.name)
                )
                .map(entry => ({
                    name: entry.name,
                    type: entry.isDirectory()
                        ? "directory"
                        : entry.isFile()
                            ? "file"
                            : "other"
                }));
        }
    );

    // TOOL 2: Read project files
    agent.registerTool(
        "read_file",
        "Reads a text file inside the project",
        async ({ filePath }) => {

            if (!filePath) {
                throw new Error("A file path is required.");
            }

            const target = await safePath(filePath);

            const stats = await fs.stat(target);

            if (!stats.isFile()) {
                throw new Error("The requested path is not a file.");
            }

            if (stats.size > 1024 * 1024) {
                throw new Error("File is too large. Maximum: 1 MB.");
            }

            return await fs.readFile(target, "utf8");
        }
    );

    console.log("[NEXUS] Basic tools registered.");
}

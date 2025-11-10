// src/mcp-server/index.ts (future feature)
/**
 * NeuraLaunch MCP Server
 * Exposes your tools for other AI apps to use
 */

// import express from "express";
// import { toolRegistry } from "@/lib/agents/tools";

// const app = express();

// // MCP Discovery endpoint
// app.get("/discover", (req, res) => {
//   res.json({
//     name: "NeuraLaunch Tools",
//     url: "http://localhost:3001/mcp",
//     description: "AI-powered development tools",
//     capabilities: ["filesystem", "git", "command", "code_analysis"],
//     tools: toolRegistry.getAll().map((tool) => ({
//       name: tool.name,
//       description: tool.description,
//       inputSchema: tool.getParametersSchema(),
//     })),
//   });
// });

// // MCP Execution endpoint
// app.post("/execute", async (req, res) => {
//   const { name, arguments: params } = req.body;

//   const result = await toolRegistry.execute(name, params, {
//     projectId: "mcp-server",
//     userId: "mcp-user",
//   });

//   res.json({
//     content: [
//       {
//         type: "text",
//         text: JSON.stringify(result.data),
//       },
//     ],
//     isError: !result.success,
//   });
// });

// app.listen(3001, () => {
//   console.log("MCP Server running on http://localhost:3001/mcp");
// });

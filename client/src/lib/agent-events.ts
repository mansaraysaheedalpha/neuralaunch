// src/lib/agent-events.ts
import { logger } from "@/lib/logger";

type ClientCallback = (data: any) => void;

// In-memory store for clients.
// A more robust solution for multi-server deployments would use a pub/sub system like Redis.
const clients: Map<string, Map<string, ClientCallback>> = new Map();

/**
 * Registers a new client to receive events for a specific project.
 * @param projectId The ID of the project to subscribe to.
 * @param clientId A unique ID for the client connection.
 * @param callback The function to call when an event is broadcast.
 */
export function registerClient(
  projectId: string,
  clientId: string,
  callback: ClientCallback
) {
  if (!clients.has(projectId)) {
    clients.set(projectId, new Map());
  }
  clients.get(projectId)!.set(clientId, callback);
  logger.info(`[Agent Events] Client ${clientId} registered for project ${projectId}.`);
}

/**
 * Unregisters a client, stopping them from receiving events.
 * @param projectId The ID of the project the client was subscribed to.
 * @param clientId The unique ID of the client to remove.
 */
export function unregisterClient(projectId: string, clientId: string) {
  if (clients.has(projectId)) {
    clients.get(projectId)!.delete(clientId);
    if (clients.get(projectId)!.size === 0) {
      clients.delete(projectId);
    }
    logger.info(`[Agent Events] Client ${clientId} unregistered from project ${projectId}.`);
  }
}

/**
 * Broadcasts an event to all registered clients for a specific project.
 * This is called from the background agent execution task.
 * @param projectId The ID of the project to broadcast to.
 * @param type The type of event (e.g., 'status_update', 'log', 'step_complete').
 * @param data The payload for the event.
 */
export async function triggerAgentEvent(
  projectId: string,
  type: string,
  data: any
) {
  logger.info(`[Agent Events] Triggering event '${type}' for project ${projectId}`);
  const projectClients = clients.get(projectId);
  if (projectClients) {
    const payload = { type, timestamp: new Date().toISOString(), ...data };
    for (const [clientId, callback] of projectClients.entries()) {
      try {
        callback(payload);
      } catch (error) {
        logger.error(`[Agent Events] Failed to send event to client ${clientId}:`, error);
        // Optional: Auto-unregister clients that fail to receive messages.
        unregisterClient(projectId, clientId);
      }
    }
  } else {
    logger.warn(`[Agent Events] No clients registered for project ${projectId} to receive event '${type}'.`);
  }
}

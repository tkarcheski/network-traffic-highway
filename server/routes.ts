import type { Express, Request, Response } from "express";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { storage } from "./storage";
import {
  insertNodeSchema,
  insertTrafficEventSchema,
  PROTOCOLS,
} from "@shared/schema";
import { DEMO_NODES, DEMO_FLOWS } from "@shared/demoData";
import { z } from "zod";

// Simple in-process pub/sub so the SSE stream can broadcast newly ingested
// events to connected dashboards (used when a real local collector POSTs data).
type Listener = (data: string) => void;
const sseClients = new Set<Listener>();
function broadcast(payload: unknown) {
  const line = `data: ${JSON.stringify(payload)}\n\n`;
  for (const fn of sseClients) fn(line);
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // ---- Reference / metadata ----------------------------------------------
  app.get("/api/meta", (_req, res) => {
    res.json({
      name: "Network Highway City",
      protocols: PROTOCOLS,
      ingest: {
        single: "POST /api/traffic  (one TrafficEvent)",
        batch: "POST /api/traffic/batch  ({ events: TrafficEvent[] })",
        nodes: "POST /api/nodes  (one Node, upsert)",
        stream: "GET /api/stream  (Server-Sent Events of new traffic)",
      },
    });
  });

  // ---- Nodes (the "city" / devices) --------------------------------------
  app.get("/api/nodes", async (_req, res) => {
    res.json(await storage.listNodes());
  });

  app.post("/api/nodes", async (req, res) => {
    const parsed = insertNodeSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.flatten() });
    const node = await storage.upsertNode(parsed.data);
    broadcast({ type: "node", node });
    res.status(201).json(node);
  });

  // ---- Traffic events (the "vehicles") -----------------------------------
  app.get("/api/traffic", async (req, res) => {
    const since = req.query.since ? Number(req.query.since) : 0;
    const limit = req.query.limit ? Number(req.query.limit) : 500;
    res.json(await storage.recentEvents(since, limit));
  });

  app.post("/api/traffic", async (req, res) => {
    const body = { ts: Date.now(), bytes: 0, ...req.body };
    const parsed = insertTrafficEventSchema.safeParse(body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.flatten() });
    const ev = await storage.recordEvent(parsed.data);
    broadcast({ type: "traffic", event: ev });
    res.status(201).json(ev);
  });

  app.post("/api/traffic/batch", async (req, res) => {
    const schema = z.object({ events: z.array(insertTrafficEventSchema.partial({ ts: true, bytes: true })) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.flatten() });
    const saved = [];
    for (const e of parsed.data.events) {
      const ev = await storage.recordEvent({ ts: Date.now(), bytes: 0, ...e } as any);
      saved.push(ev);
    }
    broadcast({ type: "traffic-batch", events: saved });
    res.status(201).json({ saved: saved.length });
  });

  // ---- Demo controls ------------------------------------------------------
  app.post("/api/demo/seed", async (_req, res) => {
    const r = await storage.seedDemo();
    res.json(r);
  });

  // Returns the demo topology (nodes + plausible flow weights) so the
  // frontend simulator can generate animated traffic without a backend write.
  app.get("/api/demo/topology", (_req, res) => {
    res.json({ nodes: DEMO_NODES, flows: DEMO_FLOWS });
  });

  app.post("/api/traffic/reset", async (_req, res) => {
    await storage.resetEvents();
    res.json({ ok: true });
  });

  // ---- Live stream (SSE) --------------------------------------------------
  app.get("/api/stream", (req: Request, res: Response) => {
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.flushHeaders?.();
    res.write(`data: ${JSON.stringify({ type: "hello" })}\n\n`);
    const listener: Listener = (line) => res.write(line);
    sseClients.add(listener);
    const ping = setInterval(() => res.write(`: ping\n\n`), 20000);
    req.on("close", () => {
      clearInterval(ping);
      sseClients.delete(listener);
    });
  });

  return httpServer;
}

import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

/**
 * Network nodes = "buildings/districts" in the city.
 * Each node represents a device on the local network.
 */
export const nodes = sqliteTable("nodes", {
  id: text("id").primaryKey(), // stable id, e.g. ip or mac
  name: text("name").notNull(),
  ip: text("ip").notNull(),
  mac: text("mac"),
  kind: text("kind").notNull(), // router | laptop | phone | printer | nas | tv | iot | server | guest | gateway
  // grid position in the isometric city (tile coords). Optional; auto-laid out if absent.
  gridX: integer("grid_x"),
  gridY: integer("grid_y"),
  lastSeen: integer("last_seen"), // epoch ms
});

/**
 * Traffic events = "vehicles" on the highways between buildings.
 * Each event is a flow/packet summary between two nodes.
 */
export const trafficEvents = sqliteTable("traffic_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ts: integer("ts").notNull(), // epoch ms
  srcId: text("src_id").notNull(),
  dstId: text("dst_id").notNull(),
  protocol: text("protocol").notNull(), // icmp | http | https | dns | ssh | udp | tcp | multicast | train | unknown
  bytes: integer("bytes").notNull().default(0),
  latencyMs: real("latency_ms"), // for ICMP/ping
  info: text("info"), // free-form detail, e.g. "GET /index.html" or "ping reply"
});

export const NODE_KINDS = [
  "router",
  "gateway",
  "laptop",
  "phone",
  "printer",
  "nas",
  "tv",
  "iot",
  "server",
  "guest",
] as const;

export const PROTOCOLS = [
  "icmp",
  "http",
  "https",
  "ollama",
  "dns",
  "ssh",
  "udp",
  "tcp",
  "multicast",
  "train",
  "unknown",
] as const;

export const insertNodeSchema = createInsertSchema(nodes);
export const insertTrafficEventSchema = createInsertSchema(trafficEvents).omit({
  id: true,
});

export type InsertNode = z.infer<typeof insertNodeSchema>;
export type Node = typeof nodes.$inferSelect;
export type InsertTrafficEvent = z.infer<typeof insertTrafficEventSchema>;
export type TrafficEvent = typeof trafficEvents.$inferSelect;

export type Protocol = (typeof PROTOCOLS)[number];
export type NodeKind = (typeof NODE_KINDS)[number];

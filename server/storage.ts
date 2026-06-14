import { users, nodes, trafficEvents } from "@shared/schema";
import type {
  User,
  InsertUser,
  Node,
  InsertNode,
  TrafficEvent,
  InsertTrafficEvent,
} from "@shared/schema";
import { DEMO_NODES } from "@shared/demoData";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc, gt, and } from "drizzle-orm";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");

// Ensure tables exist (template uses db:push, but we self-bootstrap so the
// app runs without a migration step).
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    ip TEXT NOT NULL,
    mac TEXT,
    kind TEXT NOT NULL,
    grid_x INTEGER,
    grid_y INTEGER,
    last_seen INTEGER
  );
  CREATE TABLE IF NOT EXISTS traffic_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    src_id TEXT NOT NULL,
    dst_id TEXT NOT NULL,
    protocol TEXT NOT NULL,
    bytes INTEGER NOT NULL DEFAULT 0,
    latency_ms REAL,
    info TEXT
  );
`);

export const db = drizzle(sqlite);

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  listNodes(): Promise<Node[]>;
  getNode(id: string): Promise<Node | undefined>;
  upsertNode(node: InsertNode): Promise<Node>;

  recordEvent(event: InsertTrafficEvent): Promise<TrafficEvent>;
  recentEvents(sinceTs?: number, limit?: number): Promise<TrafficEvent[]>;

  seedDemo(): Promise<{ nodes: number }>;
  resetEvents(): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    return db.select().from(users).where(eq(users.id, id)).get();
  }
  async getUserByUsername(username: string): Promise<User | undefined> {
    return db.select().from(users).where(eq(users.username, username)).get();
  }
  async createUser(insertUser: InsertUser): Promise<User> {
    return db.insert(users).values(insertUser).returning().get();
  }

  async listNodes(): Promise<Node[]> {
    return db.select().from(nodes).all();
  }
  async getNode(id: string): Promise<Node | undefined> {
    return db.select().from(nodes).where(eq(nodes.id, id)).get();
  }
  async upsertNode(node: InsertNode): Promise<Node> {
    return db
      .insert(nodes)
      .values(node)
      .onConflictDoUpdate({
        target: nodes.id,
        set: {
          name: node.name,
          ip: node.ip,
          mac: node.mac,
          kind: node.kind,
          gridX: node.gridX,
          gridY: node.gridY,
          lastSeen: node.lastSeen ?? Date.now(),
        },
      })
      .returning()
      .get();
  }

  async recordEvent(event: InsertTrafficEvent): Promise<TrafficEvent> {
    return db.insert(trafficEvents).values(event).returning().get();
  }
  async recentEvents(sinceTs = 0, limit = 500): Promise<TrafficEvent[]> {
    return db
      .select()
      .from(trafficEvents)
      .where(gt(trafficEvents.ts, sinceTs))
      .orderBy(desc(trafficEvents.ts))
      .limit(limit)
      .all();
  }

  async seedDemo(): Promise<{ nodes: number }> {
    for (const n of DEMO_NODES) {
      await this.upsertNode(n);
    }
    return { nodes: DEMO_NODES.length };
  }

  async resetEvents(): Promise<void> {
    db.delete(trafficEvents).run();
  }
}

export const storage = new DatabaseStorage();

// Seed demo nodes on boot if the city is empty.
storage.listNodes().then((existing) => {
  if (existing.length === 0) storage.seedDemo();
});

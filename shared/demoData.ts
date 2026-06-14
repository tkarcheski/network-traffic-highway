import type { InsertNode } from "./schema";

/**
 * Demo local network. Used to seed the DB and as a fallback dataset.
 * gridX/gridY are isometric tile coordinates inside a ~10x8 city plan.
 */
export const DEMO_NODES: InsertNode[] = [
  { id: "n-gateway", name: "Internet Gateway", ip: "203.0.113.1", mac: "00:1A:2B:00:00:01", kind: "gateway", gridX: 0, gridY: 4, lastSeen: Date.now() },
  { id: "n-router", name: "Core Router", ip: "192.168.1.1", mac: "00:1A:2B:3C:4D:01", kind: "router", gridX: 3, gridY: 4, lastSeen: Date.now() },
  { id: "n-laptop", name: "Work Laptop", ip: "192.168.1.21", mac: "00:1A:2B:3C:4D:21", kind: "laptop", gridX: 6, gridY: 1, lastSeen: Date.now() },
  { id: "n-phone", name: "Pixel Phone", ip: "192.168.1.42", mac: "00:1A:2B:3C:4D:42", kind: "phone", gridX: 8, gridY: 2, lastSeen: Date.now() },
  { id: "n-printer", name: "Office Printer", ip: "192.168.1.55", mac: "00:1A:2B:3C:4D:55", kind: "printer", gridX: 5, gridY: 6, lastSeen: Date.now() },
  { id: "n-nas", name: "Home NAS", ip: "192.168.1.10", mac: "00:1A:2B:3C:4D:10", kind: "nas", gridX: 2, gridY: 7, lastSeen: Date.now() },
  { id: "n-tv", name: "Living Room TV", ip: "192.168.1.66", mac: "00:1A:2B:3C:4D:66", kind: "tv", gridX: 8, gridY: 6, lastSeen: Date.now() },
  { id: "n-iot1", name: "Smart Thermostat", ip: "192.168.1.71", mac: "00:1A:2B:3C:4D:71", kind: "iot", gridX: 9, gridY: 4, lastSeen: Date.now() },
  { id: "n-iot2", name: "Security Camera", ip: "192.168.1.72", mac: "00:1A:2B:3C:4D:72", kind: "iot", gridX: 7, gridY: 7, lastSeen: Date.now() },
  { id: "n-server", name: "Dev Server", ip: "192.168.1.30", mac: "00:1A:2B:3C:4D:30", kind: "server", gridX: 4, gridY: 1, lastSeen: Date.now() },
  { id: "n-guest", name: "Guest Phone", ip: "192.168.1.99", mac: "00:1A:2B:3C:4D:99", kind: "guest", gridX: 6, gridY: 4, lastSeen: Date.now() },
];

/** Plausible flow weights between nodes; protocol mix per edge. */
export interface DemoFlow {
  src: string;
  dst: string;
  protocols: { protocol: string; weight: number; avgBytes: number }[];
}

export const DEMO_FLOWS: DemoFlow[] = [
  {
    src: "n-router",
    dst: "n-gateway",
    protocols: [
      { protocol: "train", weight: 6, avgBytes: 1500000 }, // backbone uplink
      { protocol: "https", weight: 5, avgBytes: 24000 },
      { protocol: "dns", weight: 3, avgBytes: 180 },
      { protocol: "icmp", weight: 2, avgBytes: 64 },
    ],
  },
  {
    src: "n-laptop",
    dst: "n-router",
    protocols: [
      { protocol: "https", weight: 6, avgBytes: 32000 },
      { protocol: "http", weight: 2, avgBytes: 12000 },
      { protocol: "dns", weight: 3, avgBytes: 160 },
      { protocol: "icmp", weight: 1, avgBytes: 64 },
      { protocol: "tcp", weight: 2, avgBytes: 8000 },
    ],
  },
  {
    src: "n-laptop",
    dst: "n-server",
    protocols: [
      { protocol: "ollama", weight: 7, avgBytes: 48000 }, // local LLM calls on :11434
      { protocol: "ssh", weight: 4, avgBytes: 2400 },
      { protocol: "tcp", weight: 3, avgBytes: 64000 },
      { protocol: "http", weight: 2, avgBytes: 18000 },
    ],
  },
  {
    src: "n-phone",
    dst: "n-server",
    protocols: [
      { protocol: "ollama", weight: 5, avgBytes: 36000 }, // phone app prompting the local model
      { protocol: "https", weight: 2, avgBytes: 12000 },
    ],
  },
  {
    src: "n-phone",
    dst: "n-router",
    protocols: [
      { protocol: "https", weight: 5, avgBytes: 28000 },
      { protocol: "dns", weight: 2, avgBytes: 150 },
      { protocol: "udp", weight: 2, avgBytes: 1200 },
    ],
  },
  {
    src: "n-tv",
    dst: "n-router",
    protocols: [
      { protocol: "train", weight: 5, avgBytes: 1200000 }, // streaming backbone
      { protocol: "https", weight: 3, avgBytes: 40000 },
      { protocol: "udp", weight: 2, avgBytes: 1400 },
    ],
  },
  {
    src: "n-laptop",
    dst: "n-nas",
    protocols: [
      { protocol: "train", weight: 4, avgBytes: 900000 }, // backup transfer
      { protocol: "tcp", weight: 3, avgBytes: 128000 },
      { protocol: "icmp", weight: 1, avgBytes: 64 },
    ],
  },
  {
    src: "n-laptop",
    dst: "n-printer",
    protocols: [
      { protocol: "tcp", weight: 2, avgBytes: 56000 },
      { protocol: "multicast", weight: 2, avgBytes: 320 },
    ],
  },
  {
    src: "n-iot2",
    dst: "n-nas",
    protocols: [
      { protocol: "train", weight: 3, avgBytes: 700000 }, // camera footage
      { protocol: "udp", weight: 3, avgBytes: 1600 },
    ],
  },
  {
    src: "n-iot1",
    dst: "n-router",
    protocols: [
      { protocol: "https", weight: 2, avgBytes: 4000 },
      { protocol: "multicast", weight: 3, avgBytes: 280 },
      { protocol: "icmp", weight: 1, avgBytes: 64 },
    ],
  },
  {
    src: "n-guest",
    dst: "n-router",
    protocols: [
      { protocol: "https", weight: 3, avgBytes: 22000 },
      { protocol: "dns", weight: 2, avgBytes: 170 },
      { protocol: "unknown", weight: 2, avgBytes: 900 },
    ],
  },
  {
    src: "n-server",
    dst: "n-router",
    protocols: [
      { protocol: "https", weight: 3, avgBytes: 30000 },
      { protocol: "tcp", weight: 2, avgBytes: 48000 },
      { protocol: "dns", weight: 2, avgBytes: 160 },
    ],
  },
];

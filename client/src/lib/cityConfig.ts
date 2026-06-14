// Protocol -> vehicle mapping, colors, and node-kind metadata.
// This is the legend's single source of truth and the renderer's palette.

export type Protocol =
  | "icmp"
  | "http"
  | "https"
  | "ollama"
  | "dns"
  | "ssh"
  | "udp"
  | "tcp"
  | "multicast"
  | "train"
  | "unknown";

export type NodeKind =
  | "router"
  | "gateway"
  | "laptop"
  | "phone"
  | "printer"
  | "nas"
  | "tv"
  | "iot"
  | "server"
  | "guest";

export interface VehicleSpec {
  protocol: Protocol;
  vehicle: string; // human label
  color: string; // hex
  /** relative draw size 0.8 - 1.6 */
  scale: number;
  description: string;
}

export const VEHICLES: Record<Protocol, VehicleSpec> = {
  icmp: {
    protocol: "icmp",
    vehicle: "Police Car",
    color: "#3b6fe0",
    scale: 1.0,
    description: "ICMP pings & echo replies patrolling the streets.",
  },
  http: {
    protocol: "http",
    vehicle: "Delivery Van",
    color: "#e0a23b",
    scale: 1.15,
    description: "Plain HTTP web traffic dropping off packages.",
  },
  https: {
    protocol: "https",
    vehicle: "Armored Car",
    color: "#2fb8a0",
    scale: 1.1,
    description: "Encrypted HTTPS traffic in armored transports.",
  },
  ollama: {
    protocol: "ollama",
    vehicle: "Llama",
    color: "#e0934f",
    scale: 1.25,
    description: "Ollama LLM API on :11434 — llamas hauling prompts & tokens to the local model.",
  },
  dns: {
    protocol: "dns",
    vehicle: "Courier Scooter",
    color: "#8e6fe0",
    scale: 0.85,
    description: "Quick DNS name-lookup scooters zipping around.",
  },
  ssh: {
    protocol: "ssh",
    vehicle: "Maintenance Truck",
    color: "#c0c4cc",
    scale: 1.2,
    description: "SSH remote-admin maintenance crews.",
  },
  udp: {
    protocol: "udp",
    vehicle: "City Bus",
    color: "#5bb0e0",
    scale: 1.3,
    description: "Connectionless UDP buses on fixed routes.",
  },
  tcp: {
    protocol: "tcp",
    vehicle: "Freight Truck",
    color: "#d97a3b",
    scale: 1.35,
    description: "Reliable TCP freight hauling bulk payloads.",
  },
  multicast: {
    protocol: "multicast",
    vehicle: "Utility Van",
    color: "#5bbf7a",
    scale: 1.05,
    description: "Multicast utility vehicles broadcasting to many.",
  },
  train: {
    protocol: "train",
    vehicle: "Freight Train",
    color: "#f5b634",
    scale: 1.0,
    description: "High-volume backbone routes on the rail network.",
  },
  unknown: {
    protocol: "unknown",
    vehicle: "Taxi",
    color: "#b8b8c0",
    scale: 1.0,
    description: "Unclassified traffic riding in mystery taxis.",
  },
};

export const PROTO_ORDER: Protocol[] = [
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
];

export interface NodeKindSpec {
  kind: NodeKind;
  label: string;
  /** building height in tiles (visual) */
  height: number;
  roof: string;
  wall: string;
  /** district / civic label */
  district: string;
}

export const NODE_KINDS: Record<NodeKind, NodeKindSpec> = {
  gateway: { kind: "gateway", label: "Gateway", height: 2.6, roof: "#e85d5d", wall: "#7a2e2e", district: "Port Authority" },
  router: { kind: "router", label: "Router", height: 3.2, roof: "#34c4b4", wall: "#1f6b63", district: "City Hall" },
  server: { kind: "server", label: "Server", height: 2.8, roof: "#4f8fe0", wall: "#2a4f7a", district: "Data Tower" },
  nas: { kind: "nas", label: "NAS", height: 2.0, roof: "#8e6fe0", wall: "#4a3a7a", district: "Storage Yard" },
  laptop: { kind: "laptop", label: "Laptop", height: 1.6, roof: "#e0c23b", wall: "#7a6820", district: "Residential" },
  phone: { kind: "phone", label: "Phone", height: 1.2, roof: "#5bbf7a", wall: "#2f6b45", district: "Residential" },
  printer: { kind: "printer", label: "Printer", height: 1.0, roof: "#c0c4cc", wall: "#6a6e75", district: "Industrial" },
  tv: { kind: "tv", label: "Smart TV", height: 1.4, roof: "#d97a3b", wall: "#7a4420", district: "Entertainment" },
  iot: { kind: "iot", label: "IoT", height: 0.9, roof: "#9bc34a", wall: "#566b2a", district: "Suburbs" },
  guest: { kind: "guest", label: "Guest", height: 1.3, roof: "#b8b8c0", wall: "#5a5a62", district: "Visitor Lot" },
};

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

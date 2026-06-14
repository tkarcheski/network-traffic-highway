import { execSync } from "node:child_process";

// Stop the running server by killing whatever process is listening on its port.
// Respects PORT (defaults to 5000), matching server/index.ts. Cross-platform.

const port = process.env.PORT || "5000";
const isWindows = process.platform === "win32";

function findPids(): string[] {
  try {
    if (isWindows) {
      // netstat lists connections; the PID is the last column. Match the port
      // on the local address side (":<port>") and collect LISTENING PIDs.
      const out = execSync(`netstat -ano | findstr :${port}`, {
        encoding: "utf-8",
      });
      const pids = new Set<string>();
      for (const line of out.split(/\r?\n/)) {
        const cols = line.trim().split(/\s+/);
        const local = cols[1] || "";
        const pid = cols[cols.length - 1];
        if (local.endsWith(`:${port}`) && /^\d+$/.test(pid) && pid !== "0") {
          pids.add(pid);
        }
      }
      return [...pids];
    }
    const out = execSync(`lsof -ti tcp:${port}`, { encoding: "utf-8" });
    return out.split(/\r?\n/).filter((p) => /^\d+$/.test(p));
  } catch {
    // Non-zero exit means no matching process — treat as "nothing listening".
    return [];
  }
}

const pids = findPids();

if (pids.length === 0) {
  console.log(`Nothing listening on port ${port} — already stopped.`);
  process.exit(0);
}

for (const pid of pids) {
  try {
    if (isWindows) {
      execSync(`taskkill /F /PID ${pid}`, { stdio: "inherit" });
    } else {
      execSync(`kill ${pid}`, { stdio: "inherit" });
    }
    console.log(`Stopped process ${pid} on port ${port}.`);
  } catch (err) {
    console.error(`Failed to stop process ${pid}:`, err);
    process.exit(1);
  }
}

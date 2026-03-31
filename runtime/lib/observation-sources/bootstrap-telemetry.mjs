/**
 * Bootstrap telemetry observation source adapter
 *
 * Reads bootstrap-*.jsonl files from ~/.ai-config-os/logs/ and maps
 * phase events into canonical observation event format.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

export async function loadBootstrapTelemetry({
  home = process.env.HOME || process.env.USERPROFILE,
} = {}) {
  if (!home) return [];

  const logsDir = join(home, ".ai-config-os", "logs");

  if (!existsSync(logsDir)) {
    return [];
  }

  const events = [];
  let eventCounter = 0;

  try {
    const files = readdirSync(logsDir).filter(
      (f) => f.startsWith("bootstrap-") && f.endsWith(".jsonl"),
    );

    for (const file of files) {
      const filePath = join(logsDir, file);
      const content = readFileSync(filePath, "utf8");
      const lines = content.split("\n").filter((line) => line.trim());

      for (const line of lines) {
        try {
          const phaseEvent = JSON.parse(line);
          const eventId = `bootstrap-${Date.now()}-${eventCounter++}`;

          events.push({
            type: "bootstrap_phase",
            event_id: eventId,
            message: `Bootstrap phase ${phaseEvent.phase}: ${phaseEvent.result}`,
            metadata: phaseEvent,
          });
        } catch {
          // Skip malformed JSON lines
        }
      }
    }
  } catch {
    // If reading fails, return empty array
  }

  return events;
}

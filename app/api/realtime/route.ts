import { realtimeEvents, getRealtimeSummary } from "../../lib/realtime";
import { jsonResponse } from "../../lib/server/memory";

export function GET() {
  return jsonResponse({
    data: realtimeEvents,
    summary: getRealtimeSummary(realtimeEvents),
    transport: {
      mvpMode: "polling",
      futureMode: "WebSocket / Socket.IO",
      suggestedIntervalSeconds: 15,
    },
  });
}

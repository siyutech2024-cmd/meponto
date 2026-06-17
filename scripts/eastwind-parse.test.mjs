/**
 * Parser smoke test for app/lib/eastwind.ts.
 * Run:  node --experimental-strip-types scripts/eastwind-parse.test.mjs
 *
 * Uses synthetic payloads shaped like the expected Eastwind gateway responses
 * to verify list detection, tolerant field resolution, duration/time parsing,
 * KPI extraction, delivery timeline mapping, and batch alignment. Real field
 * names are finalized against live `raw` after the first scraper run.
 */
import { parseRiders, parseDeliveries, alignTo5Min, findRecordList } from "../app/lib/eastwind.ts";

let failures = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failures++; console.error(`✗ ${name}\n   got : ${JSON.stringify(got)}\n   want: ${JSON.stringify(want)}`); }
  else console.log(`✓ ${name}`);
};
const ok = (name, cond) => { if (!cond) { failures++; console.error(`✗ ${name}`); } else console.log(`✓ ${name}`); };

const CAP = "2026-06-17T11:23:30.000Z";

// ---- riders ---------------------------------------------------------------
const ridersPayload = {
  data: {
    list: [
      { riderId: "R1", riderName: "BRUNO", phone: "11978851970", status: "未履约",
        shiftTime: "11:00-14:00", hotZone: "Santo Amaro", onlineTime: "10mins",
        restTime: "0", finishOrderNum: 0, lat: -23.65, lng: -46.7 },
      { riderId: "R2", riderName: "CLEITON", phone: "11914743222", status: "不在区域内",
        shiftTime: "11:00-14:00", hotZone: "Santo Amaro", onlineTime: 0,
        restTime: 0, finishOrderNum: 2, lat: -23.6, lng: -46.65 },
    ],
    summary: { ar: 78.6, caa: 9.1, acceptCnt: 11, overtime: 0, tsh: 5.1, finishedCnt: 1 },
  },
};

const { snapshots, kpi } = parseRiders(ridersPayload, CAP, "55000199");
eq("riders: 2 snapshots", snapshots.length, 2);
eq("riders: batch aligned to 5min", snapshots[0].captured_at, "2026-06-17T11:20:00.000Z");
eq("riders: rider id", snapshots[0].rider_ext_id, "R1");
eq("riders: name", snapshots[0].rider_name, "BRUNO");
eq("riders: status", snapshots[0].status, "未履约");
eq("riders: shift split start", snapshots[0].shift_start, "11:00");
eq("riders: shift split end", snapshots[0].shift_end, "14:00");
eq("riders: zone", snapshots[0].hot_zone, "Santo Amaro");
eq("riders: online '10mins' -> 10", snapshots[0].online_mins, 10);
eq("riders: finished count", snapshots[1].finished_cnt, 2);
ok("riders: lat parsed", snapshots[0].lat === -23.65);
ok("riders: raw retained", snapshots[0].raw && snapshots[0].raw.riderId === "R1");
eq("kpi: ar", kpi.ar, 78.6);
eq("kpi: acceptCnt", kpi.accept_cnt, 11);
eq("kpi: tsh", kpi.tsh, 5.1);
eq("kpi: batch", kpi.captured_at, "2026-06-17T11:20:00.000Z");

// ---- deliveries (nested timeline) -----------------------------------------
const deliveryPayload = {
  data: {
    list: [
      {
        orderNo: "300001", trackingId: "57646749815693", merchantName: "Famiglia Geraci",
        riderId: "R9", riderName: "CARLOS", vehicle: "自行车", status: "已超时",
        assignTime: 1781700000000,
        nodes: [
          { type: "arriveShop", eta: "11:28", actualTime: "11:25" },
          { type: "pickup", eta: "11:33", actualTime: "11:37" },
          { type: "arriveUser", eta: "11:53", actualTime: null },
        ],
      },
      { merchantName: "no order id — should be skipped" },
    ],
  },
};

const deliveries = parseDeliveries(deliveryPayload, "55000199", CAP);
eq("delivery: 1 row (skips missing order_no)", deliveries.length, 1);
eq("delivery: order_no", deliveries[0].order_no, "300001");
eq("delivery: merchant", deliveries[0].merchant_name, "Famiglia Geraci");
eq("delivery: vehicle", deliveries[0].vehicle, "自行车");
eq("delivery: status", deliveries[0].status, "已超时");
ok("delivery: assign epoch parsed", deliveries[0].t_assign === new Date(1781700000000).toISOString());
ok("delivery: shop eta set", !!deliveries[0].t_arrive_shop_eta);
ok("delivery: pickup actual set", !!deliveries[0].t_pickup_act);
ok("delivery: user actual null", deliveries[0].t_arrive_user_act === null);
ok("delivery: raw retained", deliveries[0].raw && deliveries[0].raw.orderNo === "300001");

// ---- helpers --------------------------------------------------------------
eq("alignTo5Min", alignTo5Min("2026-06-17T11:23:30.000Z"), "2026-06-17T11:20:00.000Z");
eq("findRecordList picks largest array", findRecordList(ridersPayload).length, 2);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);

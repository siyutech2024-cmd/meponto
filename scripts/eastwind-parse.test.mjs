/**
 * Parser test for app/lib/eastwind.ts using the REAL Eastwind payload shapes
 * observed from the live gateway (rider list + KPI header).
 * Run:  node --experimental-strip-types scripts/eastwind-parse.test.mjs
 */
import { parseRiders, parseDeliveries, alignTo5Min, findRecordList } from "../app/lib/eastwind.ts";

let failures = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failures++; console.error(`✗ ${name}\n   got : ${JSON.stringify(got)}\n   want: ${JSON.stringify(want)}`); }
  else console.log(`✓ ${name}`);
};
const ok = (name, cond) => { if (!cond) { failures++; console.error(`✗ ${name}`); } else console.log(`✓ ${name}`); };

const CAP = "2026-06-17T18:23:30.000Z";

// ---- riders: vendor.rider.monitor.riderList -------------------------------
const ridersPayload = {
  errno: 0, errmsg: "ok",
  data: {
    total: 2,
    riderList: [
      {
        riderName: "BRUNO", riderID: "R1", phoneNumber: "11978851970", idNo: "12345",
        vehicleType: "Bicicleta", slotPeriod: "14:00-18:00", slotArea: "Santo Amaro",
        statusStr: "Entregando", errorShow: "Nenhum horário agendado",
        location: { lat: -23.6456939, lng: -46.7553822 }, shopID: "S9", shopName: "Loja X",
        workStatus: 2, currentShift: 5280, order: 1, riderRestTimeCnt: 76, exceptionTags: [],
      },
      {
        riderName: "CLEITON", riderID: "R2", phoneNumber: "11914743222", idNo: "67890",
        vehicleType: "Motocicleta", slotPeriod: "14:00-18:00", slotArea: "Santo Amaro",
        statusStr: "Abaixo das expectativas", errorShow: "",
        location: { lat: -23.6, lng: -46.65 }, shopID: "S1", shopName: "Loja Y",
        workStatus: 1, currentShift: 2640, order: 3, riderRestTimeCnt: 0, exceptionTags: [],
      },
    ],
  },
};

// ---- KPI: vendor.rider.monitor.vendorFeatureInShift (BR comma decimals) ----
const kpiPayload = {
  errno: 0, errmsg: "ok",
  data: { AR: "66,0%", CAA: "9,1%", overtime: "4,6%", TSH: "28,8%", acceptOrderCnt: 35, completeOrderCnt: 12 },
};

const { snapshots, kpi } = parseRiders(ridersPayload, kpiPayload, CAP, "55000199");
eq("riders: 2 snapshots", snapshots.length, 2);
eq("riders: batch aligned", snapshots[0].captured_at, "2026-06-17T18:20:00.000Z");
eq("riders: rider id (riderID)", snapshots[0].rider_ext_id, "R1");
eq("riders: name", snapshots[0].rider_name, "BRUNO");
eq("riders: phone", snapshots[0].phone, "11978851970");
eq("riders: id_no", snapshots[0].id_no, "12345");
eq("riders: status (statusStr)", snapshots[0].status, "Entregando");
eq("riders: status_code (workStatus)", snapshots[0].status_code, "2");
eq("riders: error_show", snapshots[0].error_show, "Nenhum horário agendado");
eq("riders: shift_start", snapshots[0].shift_start, "14:00");
eq("riders: shift_end", snapshots[0].shift_end, "18:00");
eq("riders: hot_zone (slotArea)", snapshots[0].hot_zone, "Santo Amaro");
eq("riders: vehicle", snapshots[0].vehicle, "Bicicleta");
eq("riders: shop_id", snapshots[0].shop_id, "S9");
eq("riders: shop_name", snapshots[0].shop_name, "Loja X");
eq("riders: online_mins (5280s→88)", snapshots[0].online_mins, 88);
eq("riders: rest_mins (76s→1)", snapshots[0].rest_mins, 1);
eq("riders: finished_cnt (order)", snapshots[0].finished_cnt, 1);
eq("riders: lat (nested location)", snapshots[0].lat, -23.6456939);
eq("riders: lng (nested location)", snapshots[0].lng, -46.7553822);
ok("riders: raw retained", snapshots[0].raw && snapshots[0].raw.riderID === "R1");

eq("kpi: AR '66,0%'→66", kpi.ar, 66);
eq("kpi: CAA '9,1%'→9.1", kpi.caa, 9.1);
eq("kpi: overtime '4,6%'→4.6", kpi.overtime, 4.6);
eq("kpi: TSH '28,8%'→28.8", kpi.tsh, 28.8);
eq("kpi: acceptOrderCnt", kpi.accept_cnt, 35);
eq("kpi: completeOrderCnt", kpi.finished_cnt, 12);
eq("kpi: batch", kpi.captured_at, "2026-06-17T18:20:00.000Z");

// null payloads are tolerated
const empty = parseRiders(null, null, CAP, "X");
eq("riders: null payloads → 0 snapshots", empty.snapshots.length, 0);

// ---- helpers --------------------------------------------------------------
eq("alignTo5Min", alignTo5Min("2026-06-17T18:23:30.000Z"), "2026-06-17T18:20:00.000Z");
eq("findRecordList picks riderList", findRecordList(ridersPayload).length, 2);

// ---- deliveries parser still intact (waybill disabled but code retained) ---
const deliveries = parseDeliveries(
  { data: { list: [{ orderNo: "300001", merchantName: "M", nodes: [{ type: "arriveShop", eta: "11:28", actualTime: "11:25" }] }] } },
  "55000199", CAP,
);
eq("delivery: still parses 1 row", deliveries.length, 1);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);

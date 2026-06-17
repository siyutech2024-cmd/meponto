/**
 * Eastwind (99Food) real-time monitor payload parsing.
 *
 * The monitor gateway responses are read straight from the page by the
 * scraper and forwarded verbatim. The exact JSON field names were not
 * observable through the browser content filter, so this parser is
 * deliberately TOLERANT: every value is resolved against a list of candidate
 * keys (case-insensitive, nested-aware) and the original record is always
 * preserved in `raw`. On the first live run, inspect `raw` for any rows whose
 * typed columns are null and add the real key to the candidate list below.
 *
 * Pure functions only — no I/O — so they can be unit-tested in isolation
 * (see scripts/eastwind-parse.test.mjs).
 */

export type RiderSnapshotRow = {
  captured_at: string;
  city_id: string | null;
  rider_ext_id: string | null;   // riderID
  rider_name: string | null;     // riderName
  phone: string | null;          // phoneNumber
  id_no: string | null;          // idNo (national ID — stable join key)
  status: string | null;         // statusStr (Conectado / Entregando / Abaixo das expectativas …)
  status_code: string | null;    // workStatus (1=below expectations, 2=delivering, 4=online)
  error_show: string | null;     // errorShow (secondary status text)
  shift_start: string | null;    // from slotPeriod "14:00-18:00"
  shift_end: string | null;
  hot_zone: string | null;       // slotArea
  vehicle: string | null;        // vehicleType
  shop_id: string | null;        // shopID
  shop_name: string | null;      // shopName
  online_mins: number | null;    // currentShift (seconds) → minutes
  rest_mins: number | null;      // riderRestTimeCnt (seconds) → minutes
  finished_cnt: number | null;   // order (completed orders)
  lat: number | null;            // location.lat
  lng: number | null;            // location.lng
  raw: unknown;
};

export type KpiRow = {
  captured_at: string;
  city_id: string | null;
  ar: number | null;
  caa: number | null;
  accept_cnt: number | null;
  overtime: number | null;
  tsh: number | null;
  finished_cnt: number | null;
  raw: unknown;
};

export type DeliveryRow = {
  order_no: string;
  tracking_id: string | null;
  city_id: string | null;
  merchant_name: string | null;
  rider_ext_id: string | null;
  rider_name: string | null;
  vehicle: string | null;
  status: string | null;
  t_assign: string | null;
  t_arrive_shop_eta: string | null;
  t_arrive_shop_act: string | null;
  t_pickup_eta: string | null;
  t_pickup_act: string | null;
  t_arrive_user_eta: string | null;
  t_arrive_user_act: string | null;
  raw: unknown;
};

type AnyObj = Record<string, unknown>;

const isObj = (v: unknown): v is AnyObj =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Round an ISO timestamp down to the nearest 5 minutes (UTC). */
export function alignTo5Min(iso: string): string {
  const t = new Date(iso).getTime();
  const five = 5 * 60 * 1000;
  return new Date(Math.floor(t / five) * five).toISOString();
}

/**
 * Locate the record list (riders or deliveries) regardless of the wrapper key
 * name. Prefers the SHALLOWEST array of objects; ties are broken by length.
 * Shallowest-first matters because a row may itself contain a longer nested
 * array (e.g. a delivery's timeline `nodes`) that must NOT be mistaken for the
 * top-level list.
 */
export function findRecordList(payload: unknown): AnyObj[] {
  let best: AnyObj[] = [];
  let bestDepth = Infinity;
  const seen = new Set<unknown>();
  const walk = (node: unknown, depth: number) => {
    if (depth > 6 || node === null || typeof node !== "object") return;
    if (seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      if (node.length && node.every((x) => isObj(x))) {
        if (depth < bestDepth || (depth === bestDepth && node.length > best.length)) {
          best = node as AnyObj[];
          bestDepth = depth;
        }
      }
      node.forEach((x) => walk(x, depth + 1));
      return;
    }
    for (const k of Object.keys(node as AnyObj)) walk((node as AnyObj)[k], depth + 1);
  };
  walk(payload, 0);
  return best;
}

/** Case-insensitive lookup across the object and one level of nesting. */
function pick(obj: AnyObj, candidates: string[]): unknown {
  const lower = new Map<string, unknown>();
  for (const k of Object.keys(obj)) lower.set(k.toLowerCase(), obj[k]);
  for (const c of candidates) {
    const v = lower.get(c.toLowerCase());
    if (v !== undefined && v !== null && v !== "") return v;
  }
  // shallow nested search
  for (const k of Object.keys(obj)) {
    const child = obj[k];
    if (isObj(child)) {
      const cl = new Map<string, unknown>();
      for (const ck of Object.keys(child)) cl.set(ck.toLowerCase(), child[ck]);
      for (const c of candidates) {
        const v = cl.get(c.toLowerCase());
        if (v !== undefined && v !== null && v !== "") return v;
      }
    }
  }
  return undefined;
}

const str = (v: unknown): string | null =>
  v === undefined || v === null || v === "" ? null : String(v);

// Brazilian/intl-aware numeric parse: "66,0%" → 66, "1.234,5" → 1234.5, 35 → 35.
const num = (v: unknown): number | null => {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/[^0-9.,-]/g, "");
  if (s.includes(",") && !s.includes(".")) s = s.replace(",", "."); // comma is the decimal sep
  else s = s.replace(/,/g, ""); // comma is a thousands sep
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
};

// Eastwind reports currentShift / riderRestTimeCnt in SECONDS → minutes.
const secToMin = (v: unknown): number | null => {
  const n = num(v);
  return n === null ? null : Math.round(n / 60);
};

/**
 * Resolve a time value to an ISO string.
 *  - epoch number (s or ms) → Date
 *  - full datetime string   → Date
 *  - "HH:mm" only           → combined with the capture date (UTC fallback)
 */
function toIso(v: unknown, captureIso: string): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "number") {
    const ms = v < 1e12 ? v * 1000 : v; // seconds vs ms
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  const s = String(v).trim();
  const hm = s.match(/^(\d{1,2}):(\d{2})$/);
  if (hm) {
    const base = new Date(captureIso);
    base.setUTCHours(parseInt(hm[1]), parseInt(hm[2]), 0, 0);
    return base.toISOString();
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function splitShift(v: unknown): [string | null, string | null] {
  const s = str(v);
  if (!s) return [null, null];
  const m = s.match(/(\d{1,2}:\d{2})\s*[-~–]\s*(\d{1,2}:\d{2})/);
  return m ? [m[1], m[2]] : [s, null];
}

// --- candidate key lists. Primary names are the real Eastwind riderList keys;
//     fallbacks kept for resilience. Extend by inspecting `raw` if needed. -----
const K = {
  riderId: ["riderID", "riderId", "driverId", "id"],
  riderName: ["riderName", "name", "driverName"],
  phone: ["phoneNumber", "phone", "mobile", "phoneNo"],
  idNo: ["idNo", "idNumber", "cpf", "documentNo"],
  status: ["statusStr", "status", "statusName"],
  statusCode: ["workStatus", "statusCode", "state"],
  errorShow: ["errorShow", "errorMsg", "tip"],
  shift: ["slotPeriod", "shiftTime", "shift", "shiftPeriod"],
  shiftStart: ["shiftStartTime", "shiftStart", "startTime"],
  shiftEnd: ["shiftEndTime", "shiftEnd", "endTime"],
  zone: ["slotArea", "hotZone", "zoneName", "areaName"],
  vehicle: ["vehicleType", "vehicle", "transportType"],
  shopId: ["shopID", "shopId", "storeId"],
  shopName: ["shopName", "storeName", "poiName"],
  online: ["currentShift", "onlineTime", "onlineDuration"],
  rest: ["riderRestTimeCnt", "restTime", "restDuration"],
  finished: ["order", "finishOrderNum", "completedOrders", "completeOrderCnt"],
  lat: ["lat", "latitude", "riderLat"],
  lng: ["lng", "lon", "longitude", "riderLng"],
};

// KPI header (vendor.rider.monitor.vendorFeatureInShift → data{…})
const KK = {
  ar: ["AR", "ar", "acceptRate"],
  caa: ["CAA", "caa", "cancelRate"],
  overtime: ["overtime", "overtimeRate"],
  tsh: ["TSH", "tsh"],
  accept: ["acceptOrderCnt", "acceptCnt", "acceptNum"],
  finished: ["completeOrderCnt", "finishedCnt", "completeNum"],
};

const KD = {
  orderNo: ["orderNo", "orderId", "waybillNo", "waybillId", "billNo", "displayId", "shortId", "id"],
  trackingId: ["trackingId", "trackingNo", "orderTrackingNo", "logisticsId", "outOrderNo"],
  merchant: ["merchantName", "shopName", "storeName", "poiName", "vendorName"],
  riderId: ["riderId", "driverId", "knightId", "courierId"],
  riderName: ["riderName", "driverName", "courierName", "knightName"],
  vehicle: ["vehicle", "vehicleType", "transportType", "carType"],
  status: ["status", "timeoutStatus", "statusName", "deliveryStatus", "overtimeStatus"],
  assign: ["assignTime", "dispatchTime", "createTime", "orderTime", "sendTime"],
};

/** Parse a delivery timeline that may be a nested array of node objects. */
function timelineNodes(rec: AnyObj): AnyObj[] | null {
  for (const k of Object.keys(rec)) {
    const v = rec[k];
    if (Array.isArray(v) && v.length && v.every((x) => isObj(x))) {
      // heuristic: nodes carry a type/name + a time field
      const sample = v[0] as AnyObj;
      const keys = Object.keys(sample).map((x) => x.toLowerCase());
      if (keys.some((x) => x.includes("time") || x.includes("eta") || x.includes("type") || x.includes("node"))) {
        return v as AnyObj[];
      }
    }
  }
  return null;
}

/**
 * Parse the rider board.
 *  - ridersPayload = vendor.rider.monitor.riderList  → snapshot rows
 *  - kpiPayload    = vendor.rider.monitor.vendorFeatureInShift → KPI row
 * Either may be null/undefined.
 */
export function parseRiders(
  ridersPayload: unknown,
  kpiPayload: unknown,
  capturedAtIso: string,
  cityId: string | null,
): { snapshots: RiderSnapshotRow[]; kpi: KpiRow } {
  const captured_at = alignTo5Min(capturedAtIso);

  const list = ridersPayload != null ? findRecordList(ridersPayload) : [];
  const snapshots: RiderSnapshotRow[] = list.map((rec) => {
    let [ss, se] = splitShift(pick(rec, K.shift));
    if (!ss) ss = str(pick(rec, K.shiftStart));
    if (!se) se = str(pick(rec, K.shiftEnd));
    return {
      captured_at,
      city_id: cityId,
      rider_ext_id: str(pick(rec, K.riderId)),
      rider_name: str(pick(rec, K.riderName)),
      phone: str(pick(rec, K.phone)),
      id_no: str(pick(rec, K.idNo)),
      status: str(pick(rec, K.status)),
      status_code: str(pick(rec, K.statusCode)),
      error_show: str(pick(rec, K.errorShow)),
      shift_start: ss,
      shift_end: se,
      hot_zone: str(pick(rec, K.zone)),
      vehicle: str(pick(rec, K.vehicle)),
      shop_id: str(pick(rec, K.shopId)),
      shop_name: str(pick(rec, K.shopName)),
      online_mins: secToMin(pick(rec, K.online)),
      rest_mins: secToMin(pick(rec, K.rest)),
      finished_cnt: num(pick(rec, K.finished)),
      lat: num(pick(rec, K.lat)),
      lng: num(pick(rec, K.lng)),
      raw: rec,
    };
  });

  // KPI header: unwrap the gateway envelope (data{…}).
  const env = isObj(kpiPayload) ? (kpiPayload as AnyObj) : {};
  const h = isObj(env.data) ? (env.data as AnyObj) : env;
  const kpi: KpiRow = {
    captured_at,
    city_id: cityId,
    ar: num(pick(h, KK.ar)),
    caa: num(pick(h, KK.caa)),
    accept_cnt: num(pick(h, KK.accept)),
    overtime: num(pick(h, KK.overtime)),
    tsh: num(pick(h, KK.tsh)),
    finished_cnt: num(pick(h, KK.finished)),
    raw: kpiPayload ?? null,
  };
  return { snapshots, kpi };
}

export function parseDeliveries(
  payload: unknown,
  cityId: string | null,
  capturedAtIso: string,
): DeliveryRow[] {
  const list = findRecordList(payload);
  return list
    .map((rec): DeliveryRow | null => {
      const order_no = str(pick(rec, KD.orderNo));
      if (!order_no) return null; // order_no is the primary key — skip if absent

      // timeline: try nested nodes first, then flat *_eta / *_act fields
      let shopEta: string | null = null, shopAct: string | null = null;
      let pickEta: string | null = null, pickAct: string | null = null;
      let userEta: string | null = null, userAct: string | null = null;
      const nodes = timelineNodes(rec);
      if (nodes) {
        for (const n of nodes) {
          const label = String(pick(n, ["type", "name", "node", "stage", "label"]) ?? "").toLowerCase();
          const eta = toIso(pick(n, ["eta", "etaTime", "deta", "planTime", "expectTime", "estimateTime"]), capturedAtIso);
          const act = toIso(pick(n, ["actualTime", "realTime", "arriveTime", "actual", "finishTime"]), capturedAtIso);
          if (/shop|store|到店|merchant|arrive_?shop/.test(label)) { shopEta = eta; shopAct = act; }
          else if (/pick|取餐|fetch/.test(label)) { pickEta = eta; pickAct = act; }
          else if (/user|customer|到达用户|deliver|arrive_?user|complete/.test(label)) { userEta = eta; userAct = act; }
        }
      } else {
        shopEta = toIso(pick(rec, ["arriveShopEta", "shopEta", "arriveShopDeta"]), capturedAtIso);
        shopAct = toIso(pick(rec, ["arriveShopActual", "shopActual", "arriveShopTime"]), capturedAtIso);
        pickEta = toIso(pick(rec, ["pickupEta", "fetchEta", "pickEta"]), capturedAtIso);
        pickAct = toIso(pick(rec, ["pickupActual", "fetchTime", "pickTime"]), capturedAtIso);
        userEta = toIso(pick(rec, ["arriveUserEta", "userEta", "deliverEta"]), capturedAtIso);
        userAct = toIso(pick(rec, ["arriveUserActual", "deliverTime", "completeTime"]), capturedAtIso);
      }

      return {
        order_no,
        tracking_id: str(pick(rec, KD.trackingId)),
        city_id: cityId,
        merchant_name: str(pick(rec, KD.merchant)),
        rider_ext_id: str(pick(rec, KD.riderId)),
        rider_name: str(pick(rec, KD.riderName)),
        vehicle: str(pick(rec, KD.vehicle)),
        status: str(pick(rec, KD.status)),
        t_assign: toIso(pick(rec, KD.assign), capturedAtIso),
        t_arrive_shop_eta: shopEta,
        t_arrive_shop_act: shopAct,
        t_pickup_eta: pickEta,
        t_pickup_act: pickAct,
        t_arrive_user_eta: userEta,
        t_arrive_user_act: userAct,
        raw: rec,
      };
    })
    .filter((x): x is DeliveryRow => x !== null);
}

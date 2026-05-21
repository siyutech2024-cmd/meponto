const baseUrl = process.env.PONTOSYS_BASE_URL ?? "http://localhost:3000";

const jsonHeaders = { "Content-Type": "application/json" };
const superAdminHeaders = { "x-vento-role": "Super Admin" };
const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function urlFor(path) {
  return new URL(path, baseUrl);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function request(path, { method = "GET", headers = {}, body, expectedStatus } = {}) {
  const response = await fetch(urlFor(path), {
    method,
    headers: {
      ...headers,
      ...(body ? jsonHeaders : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const expected = expectedStatus ?? (response.ok ? response.status : 200);

  if (response.status !== expected) {
    throw new Error(`${method} ${path} returned ${response.status}; expected ${expected}. Body: ${text}`);
  }

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${method} ${path} returned non-JSON body: ${text.slice(0, 200)}`);
  }
}

async function cleanup(path) {
  try {
    await request(path, {
      method: "DELETE",
      headers: superAdminHeaders,
      expectedStatus: 200,
    });
  } catch (error) {
    console.warn(`warning cleanup failed for ${path}: ${error.message}`);
  }
}

async function runRiderWorkflow() {
  const cpf = "987.654.321-09";
  const pix = `workflow-${runId}@vento.example`;
  const createResponse = await request("/api/riders", {
    method: "POST",
    headers: superAdminHeaders,
    expectedStatus: 201,
    body: {
      name: `Workflow Rider ${runId}`,
      cpf,
      pix,
      phone: "+55 11 97777-0101",
      bairro: "Workflow Bairro",
      ponto: "Workflow Ponto",
      leader: "Workflow Leader",
      status: "Active",
    },
  });
  const rider = createResponse?.data;
  assert(rider?.id, "Created rider response did not include data.id");

  try {
    const maskedResponse = await request(`/api/riders/${rider.id}`);
    const masked = maskedResponse?.data;
    assert(masked?.id === rider.id, "Masked rider GET returned the wrong rider");
    assert(masked.cpf === "***.***.***-09", `Masked rider CPF was ${masked.cpf}`);
    assert(masked.pix !== pix, "Masked rider PIX exposed the raw value");
    assert(masked.pix === "w***@vento.example", `Masked rider PIX was ${masked.pix}`);

    const revealedResponse = await request(`/api/riders/${rider.id}`, {
      headers: {
        "x-vento-role": "Regional Manager",
        "x-vento-reveal-sensitive": "true",
      },
    });
    const revealed = revealedResponse?.data;
    assert(revealed?.id === rider.id, "Revealed rider GET returned the wrong rider");
    assert(revealed.cpf === cpf, "Revealed rider CPF did not match the created value");
    assert(revealed.pix === pix, "Revealed rider PIX did not match the created value");

    const sensitiveDeniedResponse = await request(`/api/riders/${rider.id}/sensitive`, {
      headers: { "x-vento-role": "Leader" },
      expectedStatus: 403,
    });
    assert(
      sensitiveDeniedResponse?.requiredPermission === "manage_riders_or_view_finance",
      "Sensitive rider endpoint did not report the combined permission requirement",
    );

    const sensitiveResponse = await request(`/api/riders/${rider.id}/sensitive`, {
      headers: { "x-vento-role": "Finance" },
    });
    const sensitive = sensitiveResponse?.data;
    assert(sensitive?.id === rider.id, "Sensitive rider endpoint returned the wrong rider");
    assert(sensitive.cpf === cpf, "Sensitive rider endpoint CPF did not match the created value");
    assert(sensitive.pix === pix, "Sensitive rider endpoint PIX did not match the created value");
  } finally {
    await cleanup(`/api/riders/${rider.id}`);
  }

  return rider.id;
}

async function runRewardWorkflow() {
  const createResponse = await request("/api/rewards", {
    method: "POST",
    headers: superAdminHeaders,
    expectedStatus: 201,
    body: {
      ruleName: `Workflow Reward ${runId}`,
      points: 25,
      type: "Rider",
    },
  });
  const reward = createResponse?.data;
  assert(reward?.id, "Created reward response did not include data.id");

  try {
    const forbiddenResponse = await request(`/api/rewards/${reward.id}`, {
      method: "PUT",
      headers: { "x-vento-role": "Leader" },
      expectedStatus: 403,
      body: {
        ruleName: `Forbidden Reward ${runId}`,
        points: 99,
        type: "Leader",
      },
    });
    assert(forbiddenResponse?.requiredPermission === "manage_rewards", "Forbidden reward PUT did not identify manage_rewards");

    const updateResponse = await request(`/api/rewards/${reward.id}`, {
      method: "PUT",
      headers: superAdminHeaders,
      expectedStatus: 200,
      body: {
        ruleName: `Workflow Reward Updated ${runId}`,
        points: 35,
        type: "Leader",
      },
    });
    const updated = updateResponse?.data;
    assert(updated?.id === reward.id, "Updated reward response returned the wrong reward");
    assert(updated.ruleName === `Workflow Reward Updated ${runId}`, "Updated reward ruleName did not persist");
    assert(updated.points === 35, "Updated reward points did not persist");
    assert(updated.type === "Leader", "Updated reward type did not persist");

    const listResponse = await request("/api/rewards");
    const listed = listResponse?.data?.find((item) => item.id === reward.id);
    assert(listed?.ruleName === updated.ruleName, "Reward collection did not include the updated reward");
  } finally {
    await cleanup(`/api/rewards/${reward.id}`);
  }

  return reward.id;
}

async function runPontoWorkflow() {
  const createResponse = await request("/api/pontos", {
    method: "POST",
    headers: superAdminHeaders,
    expectedStatus: 201,
    body: {
      name: `Workflow Ponto ${runId}`,
      bairro: "Workflow Bairro",
      leader: "Workflow Leader",
      ridersCount: 12,
      nightShiftLevel: "Medium",
      safetyScore: 76,
      lat: -23.55,
      lng: -46.63,
    },
  });
  const ponto = createResponse?.data;
  assert(ponto?.id, "Created ponto response did not include data.id");

  const forbiddenResponse = await request(`/api/pontos/${ponto.id}`, {
    method: "PUT",
    headers: { "x-vento-role": "Leader" },
    expectedStatus: 403,
    body: { safetyScore: 42 },
  });
  assert(forbiddenResponse?.requiredPermission === "manage_pontos", "Forbidden ponto PUT did not identify manage_pontos");

  const updateResponse = await request(`/api/pontos/${ponto.id}`, {
    method: "PUT",
    headers: superAdminHeaders,
    expectedStatus: 200,
    body: { safetyScore: 88, nightShiftLevel: "High" },
  });
  const updated = updateResponse?.data;
  assert(updated?.id === ponto.id, "Updated ponto response returned the wrong ponto");
  assert(updated.safetyScore === 88, "Updated ponto safetyScore did not persist");
  assert(updated.nightShiftLevel === "High", "Updated ponto nightShiftLevel did not persist");

  return ponto.id;
}

async function runLeaderWorkflow() {
  const createResponse = await request("/api/leaders", {
    method: "POST",
    headers: superAdminHeaders,
    expectedStatus: 201,
    body: {
      name: `Workflow Leader ${runId}`,
      phone: "+55 11 96666-0101",
      ponto: "Workflow Ponto",
      ridersCount: 14,
      nightShiftCoverage: 52,
      rating: 4.2,
      level: "Senior",
    },
  });
  const leader = createResponse?.data;
  assert(leader?.id, "Created leader response did not include data.id");

  const forbiddenResponse = await request(`/api/leaders/${leader.id}`, {
    method: "PUT",
    headers: { "x-vento-role": "Ponto Manager" },
    expectedStatus: 403,
    body: { level: "Lead" },
  });
  assert(forbiddenResponse?.requiredPermission === "manage_leaders", "Forbidden leader PUT did not identify manage_leaders");

  const updateResponse = await request(`/api/leaders/${leader.id}`, {
    method: "PUT",
    headers: superAdminHeaders,
    expectedStatus: 200,
    body: { level: "Lead", nightShiftCoverage: 68 },
  });
  const updated = updateResponse?.data;
  assert(updated?.id === leader.id, "Updated leader response returned the wrong leader");
  assert(updated.level === "Lead", "Updated leader level did not persist");
  assert(updated.nightShiftCoverage === 68, "Updated leader nightShiftCoverage did not persist");

  return leader.id;
}

async function runIncidentWorkflow() {
  const createResponse = await request("/api/incidents", {
    method: "POST",
    headers: { "x-vento-role": "Leader" },
    expectedStatus: 201,
    body: {
      rider: `Workflow Rider ${runId}`,
      ponto: "Workflow Ponto",
      severity: "High",
      location: "Workflow Avenue",
      description: "Workflow smoke incident",
      responder: "Workflow Support",
    },
  });
  const incident = createResponse?.data;
  assert(incident?.id, "Created incident response did not include data.id");
  assert(incident.status === "Open", "Created incident did not default to Open");

  const forbiddenResponse = await request(`/api/incidents/${incident.id}`, {
    method: "PUT",
    headers: { "x-vento-role": "Leader" },
    expectedStatus: 403,
    body: { status: "Closed" },
  });
  assert(forbiddenResponse?.requiredPermission === "close_incidents", "Forbidden incident PUT did not identify close_incidents");

  const updateResponse = await request(`/api/incidents/${incident.id}`, {
    method: "PUT",
    headers: { "x-vento-role": "Support" },
    expectedStatus: 200,
    body: { status: "Closed", responder: "Workflow Support Desk" },
  });
  const updated = updateResponse?.data;
  assert(updated?.id === incident.id, "Updated incident response returned the wrong incident");
  assert(updated.status === "Closed", "Updated incident status did not persist");
  assert(updated.responder === "Workflow Support Desk", "Updated incident responder did not persist");

  return incident.id;
}

async function runFinanceWorkflow() {
  const createResponse = await request("/api/finance", {
    method: "POST",
    headers: { "x-vento-role": "Finance" },
    expectedStatus: 201,
    body: {
      recipient: `Workflow Recipient ${runId}`,
      recipientType: "Rider",
      ledgerType: "Bonus",
      amount: 77,
      notes: "Workflow smoke ledger",
    },
  });
  const ledgerEntry = createResponse?.data;
  assert(ledgerEntry?.id, "Created finance response did not include data.id");
  assert(ledgerEntry.status === "Pending", "Created finance entry did not default to Pending");

  const forbiddenResponse = await request(`/api/finance/${ledgerEntry.id}`, {
    method: "PUT",
    headers: { "x-vento-role": "Leader" },
    expectedStatus: 403,
    body: { status: "Approved" },
  });
  assert(forbiddenResponse?.requiredPermission === "view_finance", "Forbidden finance PUT did not identify view_finance");

  const updateResponse = await request(`/api/finance/${ledgerEntry.id}`, {
    method: "PUT",
    headers: { "x-vento-role": "Finance" },
    expectedStatus: 200,
    body: { status: "Approved", notes: "Workflow approved" },
  });
  const updated = updateResponse?.data;
  assert(updated?.id === ledgerEntry.id, "Updated finance response returned the wrong entry");
  assert(updated.status === "Approved", "Updated finance status did not persist");
  assert(updated.notes === "Workflow approved", "Updated finance notes did not persist");

  return ledgerEntry.id;
}

const riderId = await runRiderWorkflow();
console.log(`ok workflow rider create/read-mask/read-reveal ${riderId}`);

const rewardId = await runRewardWorkflow();
console.log(`ok workflow reward create/forbidden-update/update ${rewardId}`);

const pontoId = await runPontoWorkflow();
console.log(`ok workflow ponto create/forbidden-update/update ${pontoId}`);

const leaderId = await runLeaderWorkflow();
console.log(`ok workflow leader create/forbidden-update/update ${leaderId}`);

const incidentId = await runIncidentWorkflow();
console.log(`ok workflow incident create/forbidden-close/close ${incidentId}`);

const ledgerEntryId = await runFinanceWorkflow();
console.log(`ok workflow finance create/forbidden-update/update ${ledgerEntryId}`);

console.log("Workflow smoke checks passed: 6");

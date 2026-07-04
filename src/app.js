const state = {
  ageId: "child_9_12",
  activityId: "question-lab",
  data: null
};

const els = {
  ageTabs: document.querySelector("#age-tabs"),
  activityGrid: document.querySelector("#activity-grid"),
  activityPanel: document.querySelector("#activity-panel"),
  promptList: document.querySelector("#prompt-list"),
  guardrailList: document.querySelector("#guardrail-list"),
  sessionMeta: document.querySelector("#session-meta"),
  chatForm: document.querySelector("#chat-form"),
  chatInput: document.querySelector("#chat-input"),
  chatMessages: document.querySelector("#chat-messages"),
  chatStatus: document.querySelector("#chat-status")
};

async function loadActivities() {
  const response = await fetch("./content/activities.json");
  if (!response.ok) {
    throw new Error(`Could not load activities: ${response.status}`);
  }
  return response.json();
}

function currentAge() {
  return state.data.ageBands.find((age) => age.id === state.ageId);
}

function currentActivity() {
  return currentAge().activities.find((activity) => activity.id === state.activityId);
}

function setAge(ageId) {
  state.ageId = ageId;
  state.activityId = currentAge().activities[0].id;
  render();
}

function setActivity(activityId) {
  state.activityId = activityId;
  render();
}

function renderAgeTabs() {
  els.ageTabs.innerHTML = "";
  state.data.ageBands.forEach((age) => {
    const button = document.createElement("button");
    button.className = "segment-button";
    button.type = "button";
    button.role = "tab";
    button.setAttribute("aria-selected", String(age.id === state.ageId));
    button.textContent = age.label;
    button.addEventListener("click", () => setAge(age.id));
    els.ageTabs.append(button);
  });
}

function renderActivities() {
  els.activityGrid.innerHTML = "";
  currentAge().activities.forEach((activity) => {
    const button = document.createElement("button");
    button.className = "activity-button";
    button.type = "button";
    button.setAttribute("aria-pressed", String(activity.id === state.activityId));
    button.innerHTML = `<strong>${activity.title}</strong><span>${activity.summary}</span>`;
    button.addEventListener("click", () => setActivity(activity.id));
    els.activityGrid.append(button);
  });
}

function renderWorkspace() {
  const activity = currentActivity();
  const age = currentAge();

  els.sessionMeta.innerHTML = `
    <span class="tag">${age.label}</span>
    <span class="tag">${activity.time}</span>
    <span class="tag">${activity.mode}</span>
  `;

  els.activityPanel.innerHTML = `
    <p class="eyebrow">${activity.mode}</p>
    <h3>${activity.title}</h3>
    <p>${activity.goal}</p>
    <ul class="activity-steps">
      ${activity.steps.map((step) => `<li>${step}</li>`).join("")}
    </ul>
  `;

  els.promptList.innerHTML = activity.prompts
    .map((prompt) => `<div class="prompt-card">${prompt}</div>`)
    .join("");
}

function renderGuardrails() {
  els.guardrailList.innerHTML = state.data.guardrails
    .map((item) => `<li>${item}</li>`)
    .join("");
}

function appendMessage(role, text) {
  const message = document.createElement("article");
  const paragraph = document.createElement("p");

  message.className = `chat-message ${role}`;
  paragraph.textContent = text;
  message.append(paragraph);
  els.chatMessages.append(message);
  els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
}

function setChatPending(isPending) {
  const button = els.chatForm.querySelector("button");

  button.disabled = isPending;
  els.chatInput.disabled = isPending;
  els.chatStatus.textContent = isPending ? "Thinking..." : "";
}

async function sendChatMessage(message) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      ageId: state.ageId,
      message
    })
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "Kids AI could not answer right now.");
  }

  return payload.reply || "I need to think about that another way.";
}

async function handleChatSubmit(event) {
  event.preventDefault();

  const message = els.chatInput.value.trim();

  if (!message) {
    return;
  }

  appendMessage("user", message);
  els.chatInput.value = "";
  setChatPending(true);

  try {
    const reply = await sendChatMessage(message);
    appendMessage("assistant", reply);
  } catch (error) {
    appendMessage("assistant", error.message);
  } finally {
    setChatPending(false);
    els.chatInput.focus();
  }
}

function render() {
  renderAgeTabs();
  renderActivities();
  renderWorkspace();
  renderGuardrails();
}

async function main() {
  state.data = await loadActivities();
  els.chatForm.addEventListener("submit", handleChatSubmit);
  render();
}

main().catch((error) => {
  document.body.innerHTML = `<main class="app-shell"><h1>Kids AI</h1><p>${error.message}</p></main>`;
});

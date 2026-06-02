const PROFILE_KEY = "amp_profile";

const form = document.getElementById("profileForm");
const status = document.getElementById("status");

loadProfile();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await chrome.storage.local.set({ [PROFILE_KEY]: readForm() });
  status.textContent = "保存しました。";
});

document.getElementById("exportProfile").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(readForm(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "formpass-profile.json";
  anchor.click();
  URL.revokeObjectURL(url);
});

document.getElementById("importProfile").addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;

  try {
    const profile = JSON.parse(await file.text());
    writeForm(profile);
    await chrome.storage.local.set({ [PROFILE_KEY]: profile });
    status.textContent = "インポートしました。";
  } catch (_error) {
    status.textContent = "JSONを読み込めませんでした。";
  }
});

async function loadProfile() {
  const { [PROFILE_KEY]: profile } = await chrome.storage.local.get({ [PROFILE_KEY]: {} });
  writeForm(profile);
}

function readForm() {
  const values = Object.fromEntries(new FormData(form).entries());
  for (const element of form.elements) {
    if (element.type === "checkbox" && element.name && !element.checked) {
      values[element.name] = "";
    }
  }
  return values;
}

function writeForm(profile) {
  for (const element of form.elements) {
    if (!element.name) continue;
    if (element.type === "checkbox") {
      element.checked = profile[element.name] === "on";
    } else {
      element.value = profile[element.name] || "";
    }
  }
}

const PROFILE_KEY = "amp_profile";

document.getElementById("fill").addEventListener("click", async () => {
  const status = document.getElementById("status");
  status.textContent = "入力中...";

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    status.textContent = "現在のタブを取得できませんでした。";
    return;
  }

  try {
    const result = await chrome.tabs.sendMessage(tab.id, { type: "AMP_FILL_FORM" });
    status.textContent = `${result.filled}件入力しました。対象項目 ${result.scanned}件。`;
  } catch (_error) {
    status.textContent = "このページでは実行できません。再読み込み後に試してください。";
  }
});

document.getElementById("openOptions").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

renderProfileSummary();

async function renderProfileSummary() {
  const container = document.getElementById("profileSummary");
  const { [PROFILE_KEY]: profile } = await chrome.storage.local.get({ [PROFILE_KEY]: {} });
  const normalized = normalizeProfile(profile);
  const sections = [
    {
      title: "氏名",
      rows: [
        ["漢字", normalized.fullName],
        ["カナ", normalized.fullNameKana],
        ["ローマ字", normalized.fullNameRoman],
        ["性別", normalized.gender],
        ["生年月日", formatDateParts(normalized.birthYear, normalized.birthMonth, normalized.birthDay)]
      ]
    },
    {
      title: "連絡先",
      rows: [
        ["メール", normalized.email],
        ["携帯電話", normalized.phoneMobile],
        ["自宅電話", normalized.phoneHome],
      ]
    },
    {
      title: "現住所",
      rows: [
        ["郵便番号", normalized.postalCode],
        ["都道府県", normalized.prefecture],
        ["市区郡町村", normalized.address1],
        ["町域・番地", normalized.address2],
        ["建物名・部屋番号", normalized.address3]
      ]
    },
    {
      title: "休暇中の連絡先",
      rows: [
        ["扱い", normalized.vacationSameAsCurrent === "on" ? "現住所と同じ" : "別住所"],
        ["郵便番号", normalized.vacationPostalCode],
        ["都道府県", normalized.vacationPrefecture],
        ["市区郡町村", normalized.vacationAddress1],
        ["町域・番地", normalized.vacationAddress2],
        ["建物名・部屋番号", normalized.vacationAddress3]
      ]
    },
    {
      title: "学校",
      rows: [
        ["大学・学校名", normalized.university],
        ["学部", normalized.faculty],
        ["学科・専攻", normalized.department],
        ["ゼミ・研究室", normalized.seminar],
        ["クラブ・サークル", normalized.club],
        ["入学", formatDateParts(normalized.enrollmentYear, normalized.enrollmentMonth, "")],
        ["卒業予定", formatDateParts(normalized.graduationYear, normalized.graduationMonth, "")]
      ]
    }
  ];

  if (!Object.values(profile).some(Boolean)) {
    container.innerHTML = '<p class="empty">プロフィールが未設定です。設定から入力してください。</p>';
    return;
  }

  container.replaceChildren(...sections.map(renderSection));
}

function renderSection(section) {
  const wrapper = document.createElement("section");
  wrapper.className = "summary-section";

  const title = document.createElement("h3");
  title.textContent = section.title;
  wrapper.append(title);

  const list = document.createElement("dl");
  for (const [label, value] of section.rows) {
    const term = document.createElement("dt");
    term.textContent = label;
    const detail = document.createElement("dd");
    detail.textContent = displayValue(value);
    if (!value) detail.className = "unset";
    list.append(term, detail);
  }
  wrapper.append(list);
  return wrapper;
}

function normalizeProfile(profile) {
  const birthDate = profile.birthDate || "";
  const [birthYear = "", birthMonth = "", birthDay = ""] = birthDate.split("-");
  const currentAddress = {
    postalCode: profile.postalCode || "",
    prefecture: profile.prefecture || "",
    address1: profile.address1 || "",
    address2: profile.address2 || "",
    address3: profile.address3 || ""
  };
  const vacationAddress = profile.vacationSameAsCurrent === "on" ? currentAddress : {
    postalCode: profile.vacationPostalCode || "",
    prefecture: profile.vacationPrefecture || "",
    address1: profile.vacationAddress1 || "",
    address2: profile.vacationAddress2 || "",
    address3: profile.vacationAddress3 || ""
  };

  return {
    ...profile,
    fullName: `${profile.lastName || ""} ${profile.firstName || ""}`.trim(),
    fullNameKana: `${profile.lastNameKana || ""} ${profile.firstNameKana || ""}`.trim(),
    fullNameRoman: `${profile.lastNameRoman || ""} ${profile.firstNameRoman || ""}`.trim(),
    birthYear,
    birthMonth: monthDayValue(birthMonth),
    birthDay: monthDayValue(birthDay),
    enrollmentMonth: monthDayValue(profile.enrollmentMonth),
    graduationMonth: monthDayValue(profile.graduationMonth),
    vacationPostalCode: vacationAddress.postalCode,
    vacationPrefecture: vacationAddress.prefecture,
    vacationAddress1: vacationAddress.address1,
    vacationAddress2: vacationAddress.address2,
    vacationAddress3: vacationAddress.address3
  };
}

function formatDateParts(year, month, day) {
  const parts = [];
  if (year) parts.push(`${year}年`);
  if (month) parts.push(`${month}月`);
  if (day) parts.push(`${day}日`);
  return parts.join("");
}

function monthDayValue(value) {
  const number = Number(value || 0);
  return number ? String(number) : "";
}

function displayValue(value) {
  return value || "未設定";
}

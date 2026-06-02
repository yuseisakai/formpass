const PROFILE_KEY = "amp_profile";

const FIELD_RULES = [
  rule("lastNameRoman", ["ローマ字姓", "ローマ字 姓", "roman last", "romaji sei"]),
  rule("firstNameRoman", ["ローマ字名", "ローマ字 名", "roman first", "romaji mei"]),
  rule("fullNameRoman", ["ローマ字氏名", "roman name", "romaji name"]),
  rule("lastName", ["姓", "苗字", "名字", "last name", "family name", "sei"]),
  rule("firstName", ["名", "first name", "given name", "mei"]),
  rule("fullName", ["氏名", "名前", "お名前", "name", "fullname"]),
  rule("lastNameKana", ["セイ", "カナ姓", "姓カナ", "姓かな", "last kana"]),
  rule("firstNameKana", ["メイ", "カナ名", "名カナ", "名かな", "first kana"]),
  rule("fullNameKana", ["フリガナ", "ふりがな", "氏名カナ", "カナ氏名", "kana"]),
  rule("email", ["メール", "mail", "email", "e-mail", "メールアドレス"]),
  rule("phoneMobile", ["携帯", "携帯電話", "mobile", "cell", "phone", "tel"]),
  rule("phoneHome", ["自宅電話", "固定電話", "home phone"]),
  rule("postalCode", ["郵便番号", "zip", "postal", "postcode"]),
  rule("vacationPostalCode", ["休暇中郵便番号", "休暇中の連絡先郵便番号", "休暇中 連絡先 郵便番号"]),
  rule("prefecture", ["都道府県", "prefecture", "県"]),
  rule("vacationPrefecture", ["休暇中都道府県", "休暇中の連絡先都道府県"]),
  rule("address1", ["市区郡町村", "市区町村", "住所1", "市町村", "address1", "city"]),
  rule("vacationAddress1", ["休暇中市区郡町村", "休暇中の連絡先市区郡町村", "休暇中市区町村"]),
  rule("address2", ["町域番地", "町域・番地", "番地", "丁目", "住所2", "street", "address2"]),
  rule("vacationAddress2", ["休暇中町域番地", "休暇中の連絡先町域番地", "休暇中番地"]),
  rule("address3", ["建物名部屋番号", "建物名・部屋番号", "部屋番号", "建物", "マンション", "アパート", "address3", "building"]),
  rule("vacationAddress3", ["休暇中建物", "休暇中の連絡先建物", "休暇中建物名"]),
  rule("birthYear", ["生年", "年", "birth year", "yyyy"]),
  rule("birthMonth", ["生月", "月", "birth month", "mm"]),
  rule("birthDay", ["生日", "日", "birth day", "dd"]),
  rule("birthday", ["生年月日", "誕生日", "birthdate", "birthday", "date of birth"]),
  rule("gender", ["性別", "gender", "sex"]),
  rule("university", ["大学", "学校名", "university", "school"]),
  rule("faculty", ["学部", "faculty", "department"]),
  rule("department", ["学科", "専攻", "major", "course"]),
  rule("seminar", ["ゼミ研究室", "ゼミ・研究室", "ゼミ", "研究室", "seminar", "laboratory", "lab"]),
  rule("club", ["クラブサークル", "クラブ・サークル", "クラブ", "サークル", "club", "circle"]),
  rule("enrollmentYear", ["入学年", "入学年度", "入学予定年", "enrollment year", "admission year"]),
  rule("enrollmentMonth", ["入学月", "enrollment month", "admission month"]),
  rule("graduationYear", ["卒業年", "卒業予定年", "graduation year"]),
  rule("graduationMonth", ["卒業月", "卒業予定月", "graduation month"])
];

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "AMP_FILL_FORM") return;

  fillWithStoredProfile().then((result) => sendResponse(result));
  return true;
});

async function fillWithStoredProfile() {
  const { [PROFILE_KEY]: profile } = await chrome.storage.local.get({ [PROFILE_KEY]: {} });
  const normalized = normalizeProfile(profile);
  let elements = findFillableElements();
  let filled = 0;
  const skipped = [];

  for (const element of elements) {
    const field = detectField(element);
    if (!field || !normalized[field]) {
      skipped.push(getElementLabel(element));
      continue;
    }

    if (setElementValue(element, normalized[field], field)) filled += 1;
  }

  filled += fillGenderRadio(normalized.gender);

  const lookupClicked = clickPostalLookupButton();
  if (lookupClicked) {
    await wait(900);
    elements = findFillableElements();
    for (const element of elements) {
      const field = detectField(element);
      if (!field || !normalized[field]) continue;
      if (isAddressDetailField(field) && setElementValue(element, normalized[field], field)) filled += 1;
    }
  }

  filled += fillAddressDetailsWithFallback(normalized);

  return { ok: true, filled, scanned: elements.length, skipped: skipped.slice(0, 8) };
}

function findFillableElements() {
  return Array.from(document.querySelectorAll("input, textarea, select"))
    .filter((element) => {
      if (element.disabled || element.readOnly) return false;
      if (element.offsetParent === null && element.type !== "hidden") return false;
      return !["hidden", "submit", "button", "reset", "file", "image"].includes(element.type);
    });
}

function detectField(element) {
  const splitField = detectSplitField(element);
  if (splitField) return splitField;

  const schoolField = detectSchoolTextField(element);
  if (schoolField) return schoolField;

  const label = normalizeText(getElementLabel(element));
  const candidates = FIELD_RULES
    .map((item) => ({ key: item.key, score: scoreRule(label, item.keywords, element) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.key;
}

function setElementValue(element, value, field) {
  const formattedValue = formatValueForField(value, field);
  if (element.tagName === "SELECT") return setSelectValue(element, value);
  if (element.type === "radio" || element.type === "checkbox") return setChoiceValue(element, formattedValue, field);

  element.focus();
  element.value = formattedValue;
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function setSelectValue(select, value) {
  const normalizedValue = normalizeText(value);
  const option = Array.from(select.options).find((item) => {
    const text = normalizeText(`${item.textContent} ${item.value}`);
    const numericText = numericToken(text);
    const numericValue = numericToken(normalizedValue);
    return text === normalizedValue
      || text.includes(normalizedValue)
      || normalizedValue.includes(text)
      || (numericText && numericValue && Number(numericText) === Number(numericValue));
  });

  if (!option) return false;
  select.value = option.value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function setChoiceValue(element, value, field) {
  const label = normalizeText(`${getElementLabel(element)} ${element.value}`);
  const expected = normalizeText(value);
  const aliases = choiceAliases(field, expected);
  if (!aliases.some((alias) => label.includes(alias) || alias.includes(label))) return false;

  element.checked = true;
  element.dispatchEvent(new Event("click", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function fillGenderRadio(value) {
  if (!value) return 0;
  const aliases = choiceAliases("gender", normalizeText(value));
  const radios = Array.from(document.querySelectorAll("input[type='radio']"))
    .filter((radio) => !radio.disabled && radio.offsetParent !== null)
    .filter((radio) => {
      const text = normalizeText(`${getElementLabel(radio)} ${radio.value}`);
      return text.includes("性別")
        && aliases.some((alias) => text.includes(alias) || alias.includes(text));
    });

  const radio = radios[0];
  if (!radio || radio.checked) return 0;
  radio.checked = true;
  radio.click();
  radio.dispatchEvent(new Event("change", { bubbles: true }));
  return 1;
}

function clickPostalLookupButton() {
  const buttons = Array.from(document.querySelectorAll("button, input[type='button'], input[type='submit'], a"));
  const button = buttons.find((item) => {
    if (item.disabled || item.offsetParent === null) return false;
    const text = normalizeText(`${item.textContent || ""} ${item.value || ""} ${item.getAttribute("aria-label") || ""}`);
    return /郵便番号.*検索|住所.*検索|検索/.test(text) && hasPostalCodeNearby(item);
  });

  if (!button) return false;
  button.click();
  return true;
}

function hasPostalCodeNearby(element) {
  let current = element.parentElement;
  for (let depth = 0; current && depth < 5; depth += 1) {
    const text = normalizeText(current.textContent || "");
    if (text.includes("郵便番号")) return true;
    current = current.parentElement;
  }
  return false;
}

function isAddressDetailField(field) {
  return [
    "prefecture",
    "address1",
    "address2",
    "address3",
    "vacationPrefecture",
    "vacationAddress1",
    "vacationAddress2",
    "vacationAddress3"
  ].includes(field);
}

function fillAddressDetailsWithFallback(profile) {
  const current = readCurrentAddressValues();
  const useCurrentForVacation = profile.vacationSameAsCurrent === "on";
  const values = {
    address1: profile.address1 || current.address1,
    address2: profile.address2 || current.address2,
    address3: profile.address3 || current.address3,
    vacationAddress1: useCurrentForVacation ? (profile.address1 || current.address1) : profile.vacationAddress1,
    vacationAddress2: useCurrentForVacation ? (profile.address2 || current.address2) : profile.vacationAddress2,
    vacationAddress3: useCurrentForVacation ? (profile.address3 || current.address3) : profile.vacationAddress3
  };

  let filled = 0;
  const fields = collectAddressDetailFields();
  for (const { element, field } of fields) {
    if (!field || !values[field]) continue;
    if (setElementValue(element, values[field], field)) filled += 1;
  }
  return filled;
}

function readCurrentAddressValues() {
  const values = { address1: "", address2: "", address3: "" };
  for (const { element, field } of collectAddressDetailFields()) {
    if (!field || field.startsWith("vacation")) continue;
    if (field in values && element.value) values[field] = element.value;
  }
  return values;
}

function collectAddressDetailFields() {
  const sections = collectAddressSections();
  if (sections.length) {
    return sections.flatMap((section) => {
      const prefix = section.isVacation ? "vacation" : "";
      const controls = Array.from(section.root.querySelectorAll("input, textarea"))
        .filter((element) => !element.disabled && !element.readOnly && element.offsetParent !== null)
        .filter((element) => !["checkbox", "radio", "hidden", "submit", "button", "reset", "file", "image"].includes(element.type));
      return controls.map((element) => {
        const field = detectAddressDetailFieldFromText(getElementLabel(element), prefix);
        return field ? { element, field } : null;
      }).filter(Boolean);
    });
  }

  return findFillableElements()
    .map((element) => {
      const field = detectAddressDetailField(element);
      return field ? { element, field } : null;
    })
    .filter(Boolean);
}

function collectAddressSections() {
  return Array.from(document.querySelectorAll("section, fieldset, tr, dl, .form-group, .formItem, .inputItem, div"))
    .filter((root) => {
      const text = normalizeText(root.textContent || "");
      return text.includes("郵便番号")
        && text.includes("市区郡町村")
        && text.includes("町域")
        && text.includes("建物");
    })
    .map((root) => ({
      root,
      isVacation: normalizeText(root.textContent || "").includes("休暇中")
    }))
    .filter((section, index, all) => {
      return !all.some((other, otherIndex) => (
        otherIndex !== index
        && other.root.contains(section.root)
        && other.root !== section.root
      ));
    });
}

function detectAddressDetailField(element) {
  if (element.tagName === "SELECT") return null;
  const label = getElementLabel(element);
  const isVacation = normalizeText(label).includes("休暇中") || normalizeText(label).includes("現在の連絡先");
  const prefix = isVacation ? "vacation" : "";
  return detectAddressDetailFieldFromText(label, prefix);
}

function detectAddressDetailFieldFromText(text, prefix = "") {
  const label = normalizeText(text);
  const base = (field) => prefix ? `${prefix}${field[0].toUpperCase()}${field.slice(1)}` : field;

  if (label.includes("市区郡町村") || label.includes("市区町村") || label.includes("市町村")) {
    return base("address1");
  }

  if (label.includes("町域番地") || label.includes("町域・番地") || label.includes("番地")) {
    return base("address2");
  }

  if (label.includes("建物名部屋番号") || label.includes("建物名・部屋番号") || label.includes("部屋番号") || label.includes("建物")) {
    return base("address3");
  }

  return null;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatValueForField(value, field) {
  if (isFullWidthField(field)) return toFullWidthText(value);
  if (isHalfWidthNumericField(field)) return toHalfWidthText(value).replace(/[^\d]/g, "");
  return value;
}

function isFullWidthField(field) {
  return [
    "address2",
    "address3",
    "vacationAddress2",
    "vacationAddress3"
  ].includes(field);
}

function isHalfWidthNumericField(field) {
  return /^(postalCode|vacationPostalCode|phoneMobile|phoneHome).*(Part\d)?$/.test(field)
    || ["birthYear", "birthMonth", "birthDay", "enrollmentYear", "enrollmentMonth", "graduationYear", "graduationMonth"].includes(field);
}

function toFullWidthText(value) {
  return String(value || "")
    .replace(/[!-~]/g, (char) => String.fromCharCode(char.charCodeAt(0) + 0xfee0))
    .replace(/ /g, "　")
    .replace(/-/g, "－");
}

function toHalfWidthText(value) {
  return String(value || "")
    .replace(/[！-～]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/　/g, " ");
}

function choiceAliases(field, value) {
  if (field === "gender") {
    if (/男|male/.test(value)) return ["男", "男性", "male", "man"];
    if (/女|female/.test(value)) return ["女", "女性", "female", "woman"];
  }
  return [value];
}

function getElementLabel(element) {
  const parts = [
    element.getAttribute("aria-label"),
    element.placeholder,
    element.name,
    element.id,
    element.autocomplete
  ];

  if (element.labels) {
    parts.push(...Array.from(element.labels).map((label) => label.textContent));
  }

  const row = element.closest("tr, .form-group, .formItem, .inputItem, dl, li, p, div");
  if (row) parts.push(row.textContent);

  const previous = element.previousElementSibling;
  if (previous) parts.push(previous.textContent);

  return parts.filter(Boolean).join(" ");
}

function detectSplitField(element) {
  const context = normalizeText(getElementLabel(element));
  const group = getFieldGroup(element);
  const groupText = normalizeText(group?.textContent || "");
  const combined = `${context}${groupText}`;

  if (element.tagName === "INPUT" && combined.includes("漢字氏名")) {
    return ["lastName", "firstName"][getPartIndex(element, "input")] || null;
  }

  if (element.tagName === "INPUT" && combined.includes("カナ氏名")) {
    return ["lastNameKana", "firstNameKana"][getPartIndex(element, "input")] || null;
  }

  if (element.tagName === "INPUT" && combined.includes("ローマ字氏名")) {
    return ["lastNameRoman", "firstNameRoman"][getPartIndex(element, "input")] || null;
  }

  if (combined.includes("生年月日") && element.tagName === "SELECT") {
    return ["birthYear", "birthMonth", "birthDay"][getPartIndex(element, "select")] || null;
  }

  if (combined.includes("入学") && element.tagName === "SELECT") {
    return ["enrollmentYear", "enrollmentMonth"][getPartIndex(element, "select")] || null;
  }

  if (combined.includes("卒業") && element.tagName === "SELECT") {
    return ["graduationYear", "graduationMonth"][getPartIndex(element, "select")] || null;
  }

  if (combined.includes("郵便番号")) {
    const prefix = context.includes("休暇中") || groupText.includes("休暇中") ? "vacationPostalCode" : "postalCode";
    return `${prefix}Part${detectPostalPart(element) || getPartIndex(element, "input") + 1}`;
  }

  if (context.includes("自宅電話番号")) {
    return `phoneHomePart${getPartIndex(element, "input") + 1}`;
  }

  if (context.includes("携帯電話番号")) {
    return `phoneMobilePart${getPartIndex(element, "input") + 1}`;
  }

  if (combined.includes("自宅電話番号") && !combined.includes("携帯電話番号")) {
    return `phoneHomePart${getPartIndex(element, "input") + 1}`;
  }

  if (combined.includes("携帯電話番号") && !combined.includes("自宅電話番号")) {
    return `phoneMobilePart${getPartIndex(element, "input") + 1}`;
  }

  if (combined.includes("電話番号") && element.tagName === "INPUT") {
    return `phoneMobilePart${getPartIndex(element, "input") + 1}`;
  }

  return null;
}

function detectSchoolTextField(element) {
  if (!["INPUT", "TEXTAREA"].includes(element.tagName)) return null;
  const label = normalizeText(getElementLabel(element));
  const own = normalizeText([
    element.getAttribute("aria-label"),
    element.placeholder,
    element.name,
    element.id,
    element.labels ? Array.from(element.labels).map((item) => item.textContent).join(" ") : ""
  ].filter(Boolean).join(" "));

  if (own.includes("ゼミ") || own.includes("研究室")) return "seminar";
  if (own.includes("クラブ") || own.includes("サークル")) return "club";

  if ((label.includes("ゼミ研究室") || label.includes("ゼミ・研究室")) && !label.includes("クラブ")) {
    return "seminar";
  }
  if (label.includes("クラブサークル") || label.includes("クラブ・サークル")) return "club";

  return null;
}

function getFieldGroup(element) {
  let current = element.parentElement;
  for (let depth = 0; current && depth < 6; depth += 1) {
    const controls = current.querySelectorAll("input, select, textarea");
    const text = normalizeText(current.textContent || "");
    if (controls.length > 1 && /氏名|生年月日|入学|卒業|郵便番号|電話番号/.test(text)) return current;
    current = current.parentElement;
  }

  return element.closest("tr, dl, .form-group, .formItem, .inputItem, li, p, div") || element.parentElement;
}

function getPartIndex(element, selector) {
  const group = getFieldGroup(element);
  const parts = getSplitControls(group || document, selector);
  const index = parts.indexOf(element);
  return index >= 0 ? index : 0;
}

function detectPostalPart(element) {
  const maxLength = Number(element.getAttribute("maxlength") || 0);
  if (maxLength === 3) return 1;
  if (maxLength === 4) return 2;
  return 0;
}

function getSplitControls(root, selector) {
  return Array.from(root.querySelectorAll(selector))
    .filter((item) => {
      if (item.disabled || item.readOnly) return false;
      if (item.offsetParent === null) return false;
      if (item.tagName === "INPUT") {
        return ![
          "checkbox",
          "radio",
          "hidden",
          "submit",
          "button",
          "reset",
          "file",
          "image"
        ].includes(item.type);
      }
      return true;
    });
}

function scoreRule(label, keywords, element) {
  let score = 0;
  for (const keyword of keywords) {
    const normalizedKeyword = normalizeText(keyword);
    if (label.includes(normalizedKeyword)) score += normalizedKeyword.length + 3;
  }

  if (element.type === "email" && keywords.includes("email")) score += 20;
  if (element.type === "tel" && keywords.includes("tel")) score += 15;
  return score;
}

function normalizeProfile(profile) {
  const birthDate = profile.birthDate || "";
  const [birthYear = "", birthMonth = "", birthDay = ""] = birthDate.split("-");
  const currentAddress = splitAddress(profile);
  const vacationAddress = profile.vacationSameAsCurrent === "on" ? currentAddress : splitAddress(profile, "vacation");
  const postalCodeParts = splitPostalCode(profile.postalCode);
  const vacationPostalCodeParts = splitPostalCode(vacationAddress.postalCode);
  const phoneMobileParts = splitPhoneNumber(profile.phoneMobile);
  const phoneHomeParts = splitPhoneNumber(profile.phoneHome);

  return {
    ...profile,
    fullName: profile.fullName || `${profile.lastName || ""} ${profile.firstName || ""}`.trim(),
    fullNameKana: profile.fullNameKana || `${profile.lastNameKana || ""} ${profile.firstNameKana || ""}`.trim(),
    fullNameRoman: profile.fullNameRoman || `${profile.lastNameRoman || ""} ${profile.firstNameRoman || ""}`.trim(),
    birthYear: profile.birthYear || birthYear,
    birthMonth: profile.birthMonth || monthDayValue(birthMonth),
    birthDay: profile.birthDay || monthDayValue(birthDay),
    birthday: birthDate,
    enrollmentYear: profile.enrollmentYear || "",
    enrollmentMonth: monthDayValue(profile.enrollmentMonth),
    graduationYear: profile.graduationYear || "",
    graduationMonth: monthDayValue(profile.graduationMonth),
    postalCodePart1: postalCodeParts[0],
    postalCodePart2: postalCodeParts[1],
    phoneMobilePart1: phoneMobileParts[0],
    phoneMobilePart2: phoneMobileParts[1],
    phoneMobilePart3: phoneMobileParts[2],
    phoneHomePart1: phoneHomeParts[0],
    phoneHomePart2: phoneHomeParts[1],
    phoneHomePart3: phoneHomeParts[2],
    vacationPostalCode: vacationAddress.postalCode,
    vacationPostalCodePart1: vacationPostalCodeParts[0],
    vacationPostalCodePart2: vacationPostalCodeParts[1],
    vacationPrefecture: vacationAddress.prefecture,
    vacationAddress1: vacationAddress.address1,
    vacationAddress2: vacationAddress.address2,
    vacationAddress3: vacationAddress.address3
  };
}

function splitAddress(profile, prefix = "") {
  const name = (key) => prefix ? `${prefix}${key[0].toUpperCase()}${key.slice(1)}` : key;
  return {
    postalCode: profile[name("postalCode")] || "",
    prefecture: profile[name("prefecture")] || "",
    address1: profile[name("address1")] || "",
    address2: profile[name("address2")] || "",
    address3: profile[name("address3")] || ""
  };
}

function splitPostalCode(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return [digits.slice(0, 3), digits.slice(3, 7)];
}

function splitPhoneNumber(value) {
  const raw = String(value || "").trim();
  if (raw.includes("-")) return raw.split("-").slice(0, 3);
  const digits = raw.replace(/\D/g, "");
  if (!digits) return ["", "", ""];
  if (digits.startsWith("03") || digits.startsWith("06")) {
    return [digits.slice(0, 2), digits.slice(2, 6), digits.slice(6, 10)];
  }
  return [digits.slice(0, 3), digits.slice(3, 7), digits.slice(7, 11)];
}

function monthDayValue(value) {
  const number = Number(value || 0);
  return number ? String(number) : "";
}

function numericToken(value) {
  const match = String(value || "").match(/\d+/);
  return match ? match[0] : "";
}

function rule(key, keywords) {
  return { key, keywords: keywords.map(normalizeText) };
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[：:・/／（）()[\]【】「」]/g, "");
}

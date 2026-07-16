const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const distDir = path.join(projectRoot, "dist");
const indexPath = path.join(distDir, "index.html");
const dataPath = path.join(projectRoot, "src", "data", "responses.json");
const analyticsPath = path.join(projectRoot, "src", "data", "analytics.json");

const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const analyticsConfig = JSON.parse(fs.readFileSync(analyticsPath, "utf8"));
const indexHtml = fs.readFileSync(indexPath, "utf8");

function normalizeBasePath(value) {
  const raw = String(value || "/").trim();
  if (raw === "." || raw === "./" || raw === "/") return "/";
  let pathname = raw;
  try {
    pathname = new URL(raw).pathname;
  } catch {
    pathname = raw;
  }
  const trimmed = pathname.replace(/^\/+|\/+$/g, "");
  return trimmed ? `/${trimmed}/` : "/";
}

const siteBasePath = normalizeBasePath(process.env.SITE_BASE_PATH);

function hrefFor(pathSegment = "") {
  const cleanPath = String(pathSegment).replace(/^\/+/, "");
  return `${siteBasePath}${cleanPath}`;
}

const categoryIdSets = new Map(
  analyticsConfig.categories.map((category) => [
    category.key,
    new Set(category.responseIds),
  ]),
);

function analyticsText(record) {
  return [
    record["Activity Name"],
    record["Activity Description (Short)"],
    record["Community Organizations/Partners Involved"],
    record["Organization Roles"],
    record["Outputs (E/A)"],
  ]
    .filter(Boolean)
    .join(" ");
}

function recordCategories(record) {
  return analyticsConfig.categories.filter((category) =>
    categoryIdSets.get(category.key)?.has(record["Response ID"]),
  );
}

function recordMatchesEngagement(record, engagement) {
  const roles = displayValue(record["Organization Roles"]).toLowerCase();
  if (engagement.roleLabel && roles.includes(engagement.roleLabel.toLowerCase())) {
    return true;
  }
  return engagement.pattern
    ? new RegExp(engagement.pattern, "i").test(analyticsText(record))
    : false;
}

function recordEngagements(record) {
  return analyticsConfig.engagementTypes.filter((engagement) =>
    recordMatchesEngagement(record, engagement),
  );
}

function percentage(value, total) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function classificationSummary(sourceRecords) {
  return sourceRecords.reduce(
    (acc, record) => {
      const classification = displayValue(record["Public Service or Community Engagement"]);
      if (classification.startsWith("Community Engagement")) acc.ce += 1;
      else if (classification.startsWith("Public Service")) acc.ps += 1;
      else acc.other += 1;
      return acc;
    },
    { ce: 0, ps: 0, other: 0 },
  );
}

function engagementCountForKeys(sourceRecords, keys) {
  const keySet = new Set(keys);
  return sourceRecords.filter((record) =>
    recordEngagements(record).some((engagement) => keySet.has(engagement.key)),
  ).length;
}

function strongestCategory(categoryRows) {
  return [...categoryRows].sort((a, b) => b.count - a.count)[0];
}

const signatureEngagements = [
  { key: "workforce-training", label: "Training", tone: "training" },
  { key: "research-rd", label: "Research", tone: "research" },
  { key: "funding", label: "Funding", tone: "funding" },
  { key: "agreement", label: "Agreements", tone: "agreement" },
  { key: "student-career", label: "Students", tone: "student" },
  { key: "event-convening", label: "Events", tone: "event" },
  { key: "site-tour", label: "Tours", tone: "tour" },
  { key: "facility", label: "Facilities", tone: "facility" },
];

function splitMetricEntries(value) {
  const text = displayValue(value);
  if (text === "Not specified in survey response" || text.startsWith("Not applicable")) {
    return [];
  }
  return text
    .split(/;|\n/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function compactSdgLabel(label) {
  return label.replace(/^SDG\s+(\d+):\s+/, "SDG $1 - ");
}

function compactUnitLabel(label) {
  const knownLabels = {
    "Mary Lou Fulton College for Teaching and Learning Innovation": "Mary Lou Fulton",
    "Office of the Chief Operating Officer": "Office of COO",
    "Corporate Engagement and Strategic Partnerships (Knowledge Enterprise)": "Corporate Engagement",
    "Ira A. Fulton Schools of Engineering - Global Outreach and Extended Education (GOEE)": "Fulton GOEE",
    "College of Global Futures - Lifelong Learning": "Global Futures",
    "J. Orin Edson Entrepreneurship + Innovation Institute": "Edson E+I",
    "Walter Cronkite School of Journalism and Mass Communication": "Cronkite School",
    "W. P. Carey School of Business": "W. P. Carey",
    "ASU Foundation": "ASU Foundation",
    "Julie Ann Wrigley Global Futures Laboratory": "Global Futures Lab",
  };
  return knownLabels[label] || label.replace(/\s*\([^)]*\)/g, "").slice(0, 34);
}

function rankedMetricRows(sourceRecords, field, { limit = 6, labelFormatter = (value) => value } = {}) {
  const counts = new Map();
  sourceRecords.forEach((record) => {
    splitMetricEntries(record[field]).forEach((entry) => {
      counts.set(entry, (counts.get(entry) || 0) + 1);
    });
  });

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([label, count]) => ({
      key: label,
      label: labelFormatter(label),
      fullLabel: label,
      count,
      percent: percentage(count, sourceRecords.length),
    }));
}

function domainEngagementSignatureRows(categoryRows) {
  return [...categoryRows]
    .sort((a, b) => b.count - a.count)
    .map((category) => {
      const segments = signatureEngagements.map((definition) => {
        const match = category.engagements.find((engagement) => engagement.key === definition.key);
        return {
          ...definition,
          count: match?.count || 0,
        };
      });
      const signalTotal = segments.reduce((sum, segment) => sum + segment.count, 0);
      return {
        key: category.key,
        label: category.label,
        count: category.count,
        segments: segments.map((segment) => ({
          ...segment,
          percent: signalTotal ? Math.round((segment.count / signalTotal) * 100) : 0,
        })),
      };
    });
}

function countBar(value, max) {
  const width = max ? Math.max(4, Math.round((value / max) * 100)) : 0;
  return `<div class="count-bar" aria-hidden="true"><span style="width: ${width}%"></span></div>`;
}

function ringMetric(value, total, label) {
  const percent = percentage(value, total);
  return `
    <div class="ring-metric" style="--metric-percent: ${percent}%" aria-label="${escapeAttribute(`${label}: ${percent}%`)}">
      <strong>${percent}%</strong>
      <span>${escapeHtml(label)}</span>
    </div>
  `;
}

function classificationMeter(counts, total) {
  const ce = percentage(counts.ce, total);
  const ps = percentage(counts.ps, total);
  const other = Math.max(0, 100 - ce - ps);
  return `
    <div class="classification-meter" aria-label="Classification split">
      <div class="classification-track">
        <span class="ce" style="width: ${ce}%"></span>
        <span class="ps" style="width: ${ps}%"></span>
        ${other > 0 ? `<span class="other" style="width: ${other}%"></span>` : ""}
      </div>
      <div class="classification-legend">
        <span>${counts.ce} CE</span>
        <span>${counts.ps} PS</span>
        ${counts.other > 0 ? `<span>${counts.other} other</span>` : ""}
      </div>
    </div>
  `;
}

function trendStrip(rows) {
  const max = Math.max(...rows.map((row) => row.count), 1);
  return `
    <div class="trend-strip" aria-hidden="true">
      ${rows
        .map(
          (row) =>
            `<span style="height: ${Math.max(18, Math.round((row.count / max) * 68))}px" title="${escapeAttribute(`${row.label}: ${row.count}`)}"></span>`,
        )
        .join("")}
    </div>
  `;
}

function focusDomainRotator(rows) {
  return `
    <div class="focus-domain-rotator" aria-label="${escapeAttribute(`Top 3 focus domains: ${rows.map((row) => row.label).join(", ")}`)}">
      <span>Top 3 focus domains</span>
      <div class="focus-domain-slides">
        ${rows
          .map(
            (row, index) => `
              <div class="focus-domain-slide" style="--slide-delay: ${index * 5}s">
                <strong>${escapeHtml(row.label)}</strong>
                <small>${row.count} responses / ${row.percent}% of total</small>
              </div>
            `,
          )
          .join("")}
      </div>
    </div>
  `;
}

function rankedMetricChart({ eyebrow, title, rows, total, ariaLabel }) {
  const max = Math.max(...rows.map((row) => row.count), 1);
  return `
    <article class="data-chart-card ranked-chart-card">
      <div class="data-chart-heading">
        <div>
          <p class="eyebrow">${escapeHtml(eyebrow)}</p>
          <h2>${escapeHtml(title)}</h2>
        </div>
        <span>${total} responses</span>
      </div>
      <div class="ranked-chart-list" role="list" aria-label="${escapeAttribute(ariaLabel)}">
        ${rows
          .map((row) => {
            const width = row.count ? Math.max(6, Math.round((row.count / max) * 100)) : 0;
            return `
              <div
                class="ranked-chart-row"
                role="listitem"
                style="--bar-width: ${width}%"
                title="${escapeAttribute(`${row.fullLabel || row.label}: ${row.count} responses (${row.percent}%)`)}"
                aria-label="${escapeAttribute(`${row.fullLabel || row.label}: ${row.count} responses, ${row.percent}%`)}"
              >
                <div>
                  <span>${escapeHtml(row.label)}</span>
                  <strong>${row.count}</strong>
                </div>
                <span class="ranked-chart-track" aria-hidden="true"><span></span></span>
                <small>${row.percent}%</small>
              </div>
            `;
          })
          .join("")}
      </div>
    </article>
  `;
}

function domainEngagementSignatureChart(rows) {
  return `
    <article class="data-chart-card signature-chart-card">
      <div class="data-chart-heading">
        <div>
          <p class="eyebrow">Domain engagement signature</p>
          <h2>Signal mix by focus domain</h2>
        </div>
        <span>${rows.length} domains</span>
      </div>
      <div class="signature-legend" aria-label="Engagement signal legend">
        ${signatureEngagements
          .map(
            (segment) => `
              <span class="${escapeAttribute(segment.tone)}">
                <i aria-hidden="true"></i>${escapeHtml(segment.label)}
              </span>
            `,
          )
          .join("")}
      </div>
      <div class="signature-row-list" role="list" aria-label="Engagement signal mix by focus domain">
        ${rows
          .map(
            (row) => `
              <div class="signature-row" role="listitem">
                <div class="signature-row-label">
                  <span>${escapeHtml(row.label)}</span>
                  <strong>${row.count}</strong>
                </div>
                <div class="signature-stack" aria-label="${escapeAttribute(`${row.label} engagement signal mix`)}">
                  ${row.segments
                    .map(
                      (segment) => `
                        <span
                          class="${escapeAttribute(segment.tone)}"
                          style="min-width: ${segment.count ? 2 : 0}px; width: ${segment.percent}%"
                          title="${escapeAttribute(`${segment.label}: ${segment.count}`)}"
                          aria-label="${escapeAttribute(`${segment.label}: ${segment.count}`)}"
                        ></span>
                      `,
                    )
                    .join("")}
                </div>
              </div>
            `,
          )
          .join("")}
      </div>
    </article>
  `;
}

function portfolioChartDeck(sheets) {
  return `
    <div class="chart-deck chart-deck-static">
      ${sheets
        .map(
          (sheet, index) => `
            <input
              class="chart-deck-input"
              type="radio"
              name="portfolio-evidence-chart"
              id="portfolio-chart-control-${escapeAttribute(sheet.id)}"
              ${index === 0 ? "checked" : ""}
            />
          `,
        )
        .join("")}
      <div class="chart-navigation" role="tablist" aria-label="Portfolio evidence charts">
        ${sheets
          .map(
            (sheet, index) => `
              <label
                class="chart-nav-button"
                for="portfolio-chart-control-${escapeAttribute(sheet.id)}"
                role="tab"
                aria-controls="portfolio-chart-${escapeAttribute(sheet.id)}"
              >
                <span>${String(index + 1).padStart(2, "0")}</span>
                <strong>${escapeHtml(sheet.navTitle)}</strong>
                <small>${escapeHtml(sheet.navDetail)}</small>
              </label>
            `,
          )
          .join("")}
      </div>
      <div class="chart-stage">
        ${sheets
          .map((sheet, index) => {
            const offset = index;
            const depth = Math.abs(offset);
            const sheetX = depth ? 18 * depth + 8 * offset : 0;
            return `
              <div
                class="chart-sheet chart-sheet-${escapeAttribute(sheet.id)}"
                id="portfolio-chart-${escapeAttribute(sheet.id)}"
                role="tabpanel"
                style="--sheet-depth: ${depth}; --sheet-opacity: ${Math.max(0.08, 0.32 - depth * 0.1)}; --sheet-rotate: ${offset * -0.25}deg; --sheet-scale: ${Math.max(0.92, 1 - depth * 0.025)}; --sheet-x: ${sheetX}px; --sheet-y: ${14 * depth}px"
              >
                ${sheet.content}
              </div>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
}

function miniRank(rows) {
  return `
    <div class="mini-rank">
      ${rows
        .slice(0, 3)
        .map(
          (row, index) =>
            `<span><b>${index + 1}</b>${escapeHtml(row.label)}</span>`,
        )
        .join("")}
    </div>
  `;
}

function kpiCard({ label, value, detail, note, tone = "maroon", body = "" }) {
  return `
    <article class="kpi-card ${escapeAttribute(tone)}">
      <div>
        <p>${escapeHtml(label)}</p>
        <strong>${escapeHtml(value)}</strong>
        ${detail ? `<span>${escapeHtml(detail)}</span>` : ""}
      </div>
      ${body}
      ${note ? `<small>${escapeHtml(note)}</small>` : ""}
    </article>
  `;
}

const templateSections = [
  {
    title: "Activity Basics",
    questions: [
      { label: "Activity Description (Short)", key: "Activity Description (Short)" },
      {
        label: "Activity Start Date / End Date",
        fields: [
          { label: "Start Date", key: "Start Date" },
          { label: "End Date", key: "End Date" },
        ],
      },
      {
        label: "Public Service or Community Engagement",
        key: "Public Service or Community Engagement",
      },
    ],
  },
  {
    title: "People And Units",
    questions: [
      {
        label: "Units",
        key: "ASU Units Involved",
        collaboratoryField: "units",
      },
      {
        label: "Programs/Initiatives",
        key: "__programsOrInitiatives",
        collaboratoryField: "programsOrInitiatives",
      },
      {
        label: "Faculty/Staff",
        key: "ASU Faculty/Staff Involved",
        collaboratoryField: "facultyOrStaff",
      },
      {
        label: "Community Organizations",
        key: "Community Organizations/Partners Involved",
        collaboratoryField: "communityOrganizations",
      },
      { label: "Community Contacts", key: "Community Contacts" },
      { label: "Other Institutions", key: "Other Institutions" },
      { label: "Organization Roles", key: "Organization Roles" },
    ],
  },
  {
    title: "Benefits And Location",
    questions: [
      { label: "Mutual Benefits", key: "Mutual Benefits" },
      {
        label: "Are mutual benefits articulated by both the institution and the external community group?",
        key: "Mutual Benefits Articulated by Both?",
      },
      {
        label: "Activity Location (Physical and Virtual)",
        fields: [
          { label: "Physical", key: "Activity Location - Physical" },
          { label: "Virtual", key: "Activity Location - Virtual" },
        ],
      },
      { label: "Is the Activity Funded?", key: "Is the Activity Funded?" },
    ],
  },
  {
    title: "Focus",
    questions: [
      { label: "Target Population(s)", key: "Target Population(s)" },
      { label: "SDGs", key: "SDGs" },
      {
        label: "Areas of Focus (with specific subcategories)",
        key: "Areas of Focus (with specific subcategories)",
      },
    ],
  },
  {
    title: "Students And Scholarship",
    questions: [
      {
        label: "Is this Activity connected to one or more credit-bearing courses?",
        key: "Connected to Credit-Bearing Courses?",
      },
      {
        label: "Does the Activity involve students outside of course work?",
        key: "Students Outside Coursework?",
      },
      {
        label: "Is this Activity directly connected to scholarship? (with Type(s))",
        key: "Directly Connected to Scholarship? (Type(s))",
      },
      { label: "Does this Activity have an IRB protocol?", key: "IRB Protocol?" },
      { label: "Scholarly Product(s) (E/A table)", key: "Scholarly Product(s) (E/A)" },
    ],
  },
  {
    title: "Outputs And Outcomes",
    questions: [
      { label: "Outputs (E/A table)", key: "Outputs (E/A)" },
      { label: "Institutional Outcomes (E/A table)", key: "Institutional Outcomes (E/A)" },
      { label: "Impacts on Community (E/A table)", key: "Impacts on Community (E/A)" },
      {
        label: "How many community individuals were served?",
        key: "Community Individuals Served",
      },
      {
        label: "Describe what has been learned about the community's views of this Activity",
        key: "Community Views of Activity",
      },
      {
        label: "Is there a systematic process for collecting data?",
        key: "Systematic Process for Collecting Data",
      },
    ],
  },
];

function routeSafeId(value) {
  return String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/\n/g, " ");
}

function displayValue(value) {
  return String(value || "Not specified in survey response").trim();
}

function splitEntries(value) {
  const text = displayValue(value);
  if (
    text === "Not specified in survey response" ||
    text.startsWith("Not applicable")
  ) {
    return [];
  }
  return text
    .split(/;|\n/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function extractProgramCandidates(record) {
  const text = [
    record["Activity Name"],
    record["Activity Description (Short)"],
    record["ASU Units Involved"],
    record["Organization Roles"],
  ]
    .filter(Boolean)
    .join(". ");
  const patterns = [
    /\b[A-Z][A-Za-z0-9&'.-]*(?:\s+(?:&|and|[A-Z0-9][A-Za-z0-9&'.-]*)){0,9}\s+(?:Program|Programs|Initiative|Initiatives|Lab|Laboratory|Center|Centers|Cohort|Series)\b/g,
    /\b(?:PEAK|GLOBE)\b/g,
  ];
  const candidates = new Set();
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const candidate = match[0].replace(/[.,;:)]+$/g, "").trim();
      if (candidate.length >= 4) candidates.add(candidate);
    }
  }
  return [...candidates].filter(
    (candidate, index, all) =>
      !all.some(
        (other, otherIndex) =>
          otherIndex !== index &&
          other.length > candidate.length &&
          other.includes(candidate),
      ),
  );
}

function valueForKey(record, key) {
  if (key === "__programsOrInitiatives") {
    const candidates = extractProgramCandidates(record);
    return candidates.length
      ? candidates.join("; ")
      : "No formal program or initiative explicitly identified in this survey response.";
  }
  return record[key];
}

function sourceColumnsForQuestion(question) {
  if (question.fields) return question.fields.map((field) => field.key);
  if (question.key === "__programsOrInitiatives") {
    return [
      "Activity Name",
      "Activity Description (Short)",
      "ASU Units Involved",
      "Organization Roles",
    ];
  }
  return [question.key];
}

function splitList(value) {
  const text = displayValue(value);
  if (
    text === "Not specified in survey response" ||
    text.startsWith("Not applicable") ||
    text.length < 90
  ) {
    return null;
  }
  const parts = text
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 1 ? parts : null;
}

function classificationTone(value) {
  if (value.startsWith("Community Engagement")) return "ce";
  if (value.startsWith("Public Service")) return "ps";
  if (value.startsWith("Not an activity")) return "muted";
  return "neutral";
}

function safeJson(value) {
  return JSON.stringify(value, null, 2)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function renderAnswer(value) {
  const list = splitList(value);
  if (list) {
    return `<ul>${list.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
  }
  return `<p>${escapeHtml(displayValue(value))}</p>`;
}

function renderQuestion(question, record) {
  const sourceColumns = sourceColumnsForQuestion(question).join("|");
  const answerHtml = question.fields
    ? `<div class="answer-stack">${question.fields
        .map(
          (field) => `
            <div class="answer-subfield" data-source-column="${escapeAttribute(field.key)}">
              <span>${escapeHtml(field.label)}</span>
              ${renderAnswer(valueForKey(record, field.key))}
            </div>
          `,
        )
        .join("")}</div>`
    : renderAnswer(valueForKey(record, question.key));

  return `
    <article
      class="template-question"
      data-scrape-field="${escapeAttribute(question.label)}"
      data-source-column="${escapeAttribute(sourceColumns)}"
      ${question.collaboratoryField ? `data-collaboratory-field="${escapeAttribute(question.collaboratoryField)}"` : ""}
    >
      <p class="question-tag">Question</p>
      <h3>${escapeHtml(question.label)}</h3>
      <div class="answer" data-scrape-answer="true">${answerHtml}</div>
    </article>
  `;
}

function structuredPayload(record) {
  const units = splitEntries(record["ASU Units Involved"]);
  const programsOrInitiatives = extractProgramCandidates(record);
  const facultyOrStaff = splitEntries(record["ASU Faculty/Staff Involved"]);
  const communityOrganizations = splitEntries(record["Community Organizations/Partners Involved"]);
  const otherInstitutions = splitEntries(record["Other Institutions"]);

  return {
    sourceType: "CEN Collaboratory survey response page",
    responseId: record["Response ID"],
    activityTitle: record["Activity Name"],
    activityDescription: record["Activity Description (Short)"],
    classification: record["Public Service or Community Engagement"],
    units,
    programsOrInitiatives,
    facultyOrStaff,
    communityOrganizations,
    otherInstitutions,
    collaboratoryFields: {
      units,
      programsOrInitiatives,
      facultyOrStaff,
      communityOrganizations,
      otherInstitutions,
    },
    sourceColumns: record,
    questions: templateSections.flatMap((section) =>
      section.questions.map((question) => ({
        section: section.title,
        question: question.label,
        collaboratoryField: question.collaboratoryField || "",
        sourceColumns: sourceColumnsForQuestion(question),
        answer: question.fields
          ? Object.fromEntries(
              question.fields.map((field) => [field.label, displayValue(valueForKey(record, field.key))]),
            )
          : displayValue(valueForKey(record, question.key)),
      })),
    ),
  };
}

function renderResponsePage(record) {
  const id = routeSafeId(record["Response ID"]);
  const title = displayValue(record["Activity Name"]);
  const classification = displayValue(record["Public Service or Community Engagement"]);
  const tone = classificationTone(classification);

  return `
    <main
      class="response-main"
      data-scrape-page="cen-community-engagement-activity"
      data-response-id="${escapeAttribute(id)}"
    >
      <nav class="top-nav" aria-label="Response navigation">
        <a class="brand" href="${escapeAttribute(hrefFor())}">CEN Response Viewer</a>
        <div class="nav-actions">
          <a href="${escapeAttribute(hrefFor())}">All responses</a>
          <a href="${escapeAttribute(hrefFor("analytics"))}">Analytics</a>
        </div>
      </nav>
      <header class="record-header">
        <div>
          <p class="eyebrow">Response ${escapeHtml(id)}</p>
          <h1 data-scrape-field="Activity Name">${escapeHtml(title)}</h1>
        </div>
        <div class="badge ${tone}" data-scrape-field="Public Service or Community Engagement">
          ${escapeHtml(classification)}
        </div>
      </header>
      ${templateSections
        .map(
          (section) => `
            <section class="section-band" data-scrape-section="${escapeAttribute(section.title)}">
              <h2>${escapeHtml(section.title)}</h2>
              <div class="template-list">
                ${section.questions.map((question) => renderQuestion(question, record)).join("")}
              </div>
            </section>
          `,
        )
        .join("")}
    </main>
  `;
}

function renderIndexPage(records) {
  const counts = records.reduce(
    (acc, record) => {
      const classification = displayValue(record["Public Service or Community Engagement"]);
      if (classification.startsWith("Community Engagement")) acc.ce += 1;
      else if (classification.startsWith("Public Service")) acc.ps += 1;
      else acc.other += 1;
      return acc;
    },
    { ce: 0, ps: 0, other: 0 },
  );

  return `
    <main class="index-main" data-scrape-page="cen-response-index">
      <nav class="top-nav">
        <a class="brand" href="${escapeAttribute(hrefFor())}">CEN Response Viewer</a>
        <div class="nav-actions"></div>
      </nav>
      <header class="index-header">
        <div>
          <p class="eyebrow">${records.length} response pages</p>
          <h1>CEN Survey Response Pages</h1>
        </div>
        <div class="header-actions">
          <div class="stats">
            <span>${counts.ce} CE</span>
            <span>${counts.ps} PS</span>
            ${counts.other > 0 ? `<span>${counts.other} other</span>` : ""}
          </div>
          <a class="primary-button" href="${escapeAttribute(hrefFor("analytics"))}">Analytics</a>
        </div>
      </header>
      <section class="response-list">
        ${records
          .map((record) => {
            const id = routeSafeId(record["Response ID"]);
            const classification = displayValue(record["Public Service or Community Engagement"]);
            return `
              <a class="response-row" href="${escapeAttribute(hrefFor(id))}" data-response-id="${escapeAttribute(id)}">
                <span class="response-id">${escapeHtml(id)}</span>
                <span class="response-title">${escapeHtml(record["Activity Name"])}</span>
                <span class="row-pill ${classificationTone(classification)}">
                  ${escapeHtml(classification.split(" - ")[0])}
                </span>
              </a>
            `;
          })
          .join("")}
      </section>
    </main>
  `;
}

function renderAnalyticsPage(records) {
  const categoryRows = analyticsConfig.categories.map((category) => {
    const categoryRecords = records.filter((record) =>
      categoryIdSets.get(category.key)?.has(record["Response ID"]),
    );
    return {
      ...category,
      records: categoryRecords,
      count: categoryRecords.length,
      percent: percentage(categoryRecords.length, records.length),
      engagements: analyticsConfig.engagementTypes.map((engagement) => ({
        ...engagement,
        count: categoryRecords.filter((record) =>
          recordMatchesEngagement(record, engagement),
        ).length,
      })),
    };
  });
  const taggedIds = new Set(
    records
      .filter((record) => recordCategories(record).length)
      .map((record) => record["Response ID"]),
  );
  const classification = classificationSummary(records);
  const topCategory = strongestCategory(categoryRows);
  const rankedCategories = [...categoryRows].sort((a, b) => b.count - a.count);
  const topFocusDomains = rankedCategories.slice(0, 3);
  const studentWorkforceCount = engagementCountForKeys(records, [
    "student-career",
    "workforce-training",
  ]);
  const researchStrategicCount = engagementCountForKeys(records, [
    "research-rd",
    "agreement",
    "facility",
  ]);
  const sdgAlignment = rankedMetricRows(records, "SDGs", {
    labelFormatter: compactSdgLabel,
  });
  const topUnits = rankedMetricRows(records, "ASU Units Involved", {
    labelFormatter: compactUnitLabel,
  });
  const domainEngagementSignature = domainEngagementSignatureRows(categoryRows);
  const maxCategoryCount = Math.max(...categoryRows.map((row) => row.count), 1);
  const engagementRows = analyticsConfig.engagementTypes.map((engagement) => {
    const count = records.filter((record) =>
      recordMatchesEngagement(record, engagement),
    ).length;
    return {
      ...engagement,
      count,
      percent: percentage(count, records.length),
    };
  });
  const maxEngagementCount = Math.max(...engagementRows.map((row) => row.count), 1);

  return `
    <main class="analytics-main" data-scrape-page="cen-analytics-dashboard">
      <nav class="top-nav">
        <a class="brand" href="${escapeAttribute(hrefFor())}">CEN Response Viewer</a>
        <div class="nav-actions">
          <a href="${escapeAttribute(hrefFor())}">All responses</a>
        </div>
      </nav>
      <header class="analytics-hero">
        <div class="analytics-hero-copy">
          <p class="eyebrow">${records.length} validated response pages</p>
          <h1>CEN Analytics Dashboard</h1>
          <p>
            Portfolio view of focus domains, engagement type, student/workforce activity,
            research partnerships, and strategic relationship signals across the cleaned
            survey dataset.
          </p>
        </div>
        <div class="analytics-hero-visual" aria-label="Dashboard signal summary">
          ${trendStrip(topFocusDomains)}
          ${focusDomainRotator(topFocusDomains)}
        </div>
      </header>
      <section class="kpi-grid" aria-label="Analytics KPI overview">
        ${kpiCard({
          label: "Total responses",
          value: records.length,
          detail: "validated survey pages",
          note: `${taggedIds.size} in five focus domains`,
          tone: "gold",
        })}
        ${kpiCard({
          label: "Engagement classification",
          value: `${classification.ce} CE`,
          detail: `${classification.ps} PS${classification.other > 0 ? ` / ${classification.other} other` : ""}`,
          tone: "maroon",
          body: classificationMeter(classification, records.length),
        })}
        ${kpiCard({
          label: "Top focus category",
          value: topCategory.label,
          detail: `${topCategory.count} responses / ${topCategory.percent}%`,
          tone: "maroon",
        })}
        ${kpiCard({
          label: "Student / workforce",
          value: studentWorkforceCount,
          detail: `${percentage(studentWorkforceCount, records.length)}% of responses`,
          tone: "gold",
        })}
        ${kpiCard({
          label: "Research / strategic",
          value: researchStrategicCount,
          detail: `${percentage(researchStrategicCount, records.length)}% of responses`,
          tone: "maroon",
        })}
      </section>
      <section class="analytics-panel data-charts-panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Charts</p>
            <h2>Portfolio evidence</h2>
          </div>
          <span class="panel-count">${records.length} response pages</span>
        </div>
        ${portfolioChartDeck([
          {
            id: "sdg",
            navTitle: "SDG alignment",
            navDetail: "Strategic goals",
            content: rankedMetricChart({
              eyebrow: "SDG alignment",
              title: "Strategic goals",
              rows: sdgAlignment,
              total: records.length,
              ariaLabel: "Ranked chart showing SDG alignment across response pages",
            }),
          },
          {
            id: "units",
            navTitle: "Top ASU units",
            navDetail: "Internal contributors",
            content: rankedMetricChart({
              eyebrow: "Top ASU units",
              title: "Internal contributors",
              rows: topUnits,
              total: records.length,
              ariaLabel: "Ranked chart showing top ASU units involved",
            }),
          },
          {
            id: "domain",
            navTitle: "Domain mix",
            navDetail: "Engagement signature",
            content: domainEngagementSignatureChart(domainEngagementSignature),
          },
        ])}
      </section>
      <section class="analytics-grid focus-grid">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Focus domains</p>
            <h2>Category coverage</h2>
          </div>
          <button class="filter-button reset active" type="button">All domains</button>
        </div>
        <div class="category-grid">
          ${rankedCategories
            .map(
              (category) => `
                <article class="category-card">
                  <span class="category-label">${escapeHtml(category.label)}</span>
                  <strong>${category.count}</strong>
                  ${countBar(category.count, maxCategoryCount)}
                  <small>${category.percent}% of all responses</small>
                </article>
              `,
            )
            .join("")}
        </div>
      </section>
      <section class="analytics-panel engagement-panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">All responses</p>
            <h2>Engagement signals</h2>
          </div>
          <span class="panel-count">${records.length} records</span>
        </div>
        <div class="engagement-signal-grid">
          <article class="engagement-signal-card active">
            <div><span>All engagement types</span><strong>${records.length}</strong></div>
            ${countBar(records.length, records.length)}
            <small>100% of all responses</small>
          </article>
          ${engagementRows
            .map(
              (engagement) => `
                <article class="engagement-signal-card">
                  <div><span>${escapeHtml(engagement.label)}</span><strong>${engagement.count}</strong></div>
                  ${countBar(engagement.count, maxEngagementCount)}
                  <small>${engagement.percent}% of current records</small>
                </article>
              `,
            )
            .join("")}
        </div>
      </section>
      <section class="analytics-panel record-panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Filtered records</p>
            <h2>All focus domains / all engagement types</h2>
          </div>
          <span class="panel-count">${records.length} shown</span>
        </div>
        <div class="analytics-response-list">
          ${records
            .map((record) => {
              const id = routeSafeId(record["Response ID"]);
              const categories = recordCategories(record);
              const engagements = recordEngagements(record).slice(0, 3);
              const categoryTags = categories.length
                ? categories
                    .map(
                      (category) =>
                        `<span class="tag domain">${escapeHtml(category.label)}</span>`,
                    )
                    .join("")
                : `<span class="tag muted">Outside focus domains</span>`;
              const engagementTags = engagements.length
                ? engagements
                    .map(
                      (engagement) =>
                        `<span class="tag engagement">${escapeHtml(engagement.label)}</span>`,
                    )
                    .join("")
                : `<span class="tag muted">No engagement tag</span>`;
              return `
                <a class="analytics-response-row" href="${escapeAttribute(hrefFor(id))}">
                  <span class="response-id">${escapeHtml(id)}</span>
                  <span class="analytics-response-title">${escapeHtml(record["Activity Name"])}</span>
                  <span class="tag-stack">${categoryTags}</span>
                  <span class="tag-stack engagement-tags">${engagementTags}</span>
                </a>
              `;
            })
            .join("")}
        </div>
      </section>
    </main>
  `;
}

function injectContent(html, content, title, payload) {
  const meta = payload
    ? `
    <meta name="cen-response-id" content="${escapeAttribute(payload.responseId)}" />
    <meta name="cen-activity-title" content="${escapeAttribute(payload.activityTitle)}" />
    <meta name="description" content="${escapeAttribute(payload.activityDescription)}" />`
    : "";
  const jsonScript = payload
    ? `
    <script type="application/json" id="cen-response-json">
${safeJson(payload)}
    </script>`
    : "";
  return html
    .replace("<title>CEN Collaboratory Response Viewer</title>", `<title>${escapeHtml(title)}</title>${meta}`)
    .replace('<div id="root"></div>', `<div id="root">${content}</div>${jsonScript}`);
}

const ids = new Set();
const staticIndexHtml = injectContent(
  indexHtml,
  renderIndexPage(data.records),
  "CEN Survey Response Pages",
);

fs.writeFileSync(indexPath, staticIndexHtml);

const staticAnalyticsHtml = injectContent(
  indexHtml,
  renderAnalyticsPage(data.records),
  "CEN Analytics Dashboard",
);
const analyticsDir = path.join(distDir, "analytics");
fs.mkdirSync(analyticsDir, { recursive: true });
fs.writeFileSync(path.join(analyticsDir, "index.html"), staticAnalyticsHtml);
fs.writeFileSync(path.join(distDir, "analytics.html"), staticAnalyticsHtml);

for (const record of data.records) {
  const id = routeSafeId(record["Response ID"]);
  if (!id || ids.has(id)) continue;
  ids.add(id);

  const payload = structuredPayload(record);
  const pageHtml = injectContent(
    indexHtml,
    renderResponsePage(record),
    `${record["Activity Name"]} | CEN Response ${id}`,
    payload,
  );
  const pageDir = path.join(distDir, id);
  fs.mkdirSync(pageDir, { recursive: true });
  fs.writeFileSync(path.join(pageDir, "index.html"), pageHtml);

  // Vercel cleanUrls can serve /214410711 from 214410711.html directly.
  fs.writeFileSync(path.join(distDir, `${id}.html`), pageHtml);
}

// const vercelConfig = {
//   cleanUrls: true,
//   trailingSlash: false,
//   rewrites: [
//     {
//       source: "/(.*)",
//       destination: "/index.html",
//     },
//   ],
// };

// fs.writeFileSync(
//   path.join(distDir, "vercel.json"),
//   `${JSON.stringify(vercelConfig, null, 2)}\n`,
// );

fs.writeFileSync(path.join(distDir, "404.html"), staticIndexHtml);

console.log(`Generated ${ids.size} scrape-ready static response pages in dist/.`);

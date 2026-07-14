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

function countBar(value, max) {
  const width = max ? Math.max(4, Math.round((value / max) * 100)) : 0;
  return `<div class="count-bar" aria-hidden="true"><span style="width: ${width}%"></span></div>`;
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
        <div class="nav-actions">
          <a href="${escapeAttribute(hrefFor("analytics"))}">Analytics</a>
        </div>
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
            <span>${counts.other} other</span>
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
    };
  });
  const taggedIds = new Set(
    records
      .filter((record) => recordCategories(record).length)
      .map((record) => record["Response ID"]),
  );
  const multiDomainCount = records.filter((record) => recordCategories(record).length > 1).length;
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
      <header class="analytics-header">
        <div>
          <p class="eyebrow">${records.length} response pages</p>
          <h1>CEN Analytics Dashboard</h1>
        </div>
        <a class="primary-button" href="${escapeAttribute(hrefFor())}">All responses</a>
      </header>
      <section class="stat-grid" aria-label="Analytics overview">
        <article class="stat-card"><p>Total responses</p><strong>${records.length}</strong><span>survey pages</span></article>
        <article class="stat-card"><p>In focus domains</p><strong>${taggedIds.size}</strong><span>${percentage(taggedIds.size, records.length)}% of total</span></article>
        <article class="stat-card"><p>Outside focus domains</p><strong>${records.length - taggedIds.size}</strong><span>uncategorized by this view</span></article>
        <article class="stat-card"><p>Multi-domain</p><strong>${multiDomainCount}</strong><span>tagged in 2+ domains</span></article>
      </section>
      <section class="analytics-panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Focus domains</p>
            <h2>Response category coverage</h2>
          </div>
        </div>
        <div class="category-grid">
          ${categoryRows
            .map(
              (category) => `
                <article class="category-card">
                  <span>${escapeHtml(category.label)}</span>
                  <strong>${category.count}</strong>
                  ${countBar(category.count, maxCategoryCount)}
                  <small>${category.percent}% of all responses</small>
                </article>
              `,
            )
            .join("")}
        </div>
      </section>
      <section class="analytics-grid">
        <article class="analytics-panel">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">All responses</p>
              <h2>Engagement mix</h2>
            </div>
            <span class="panel-count">${records.length} records</span>
          </div>
          <div class="bar-list">
            ${engagementRows
              .map(
                (engagement) => `
                  <div class="bar-row">
                    <div><span>${escapeHtml(engagement.label)}</span><strong>${engagement.count}</strong></div>
                    ${countBar(engagement.count, maxEngagementCount)}
                  </div>
                `,
              )
              .join("")}
          </div>
        </article>
        <article class="analytics-panel">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">Cross-tab</p>
              <h2>Domains by engagement</h2>
            </div>
          </div>
          <div class="matrix-wrap">
            <table class="matrix-table">
              <thead>
                <tr>
                  <th>Domain</th>
                  <th>Training</th>
                  <th>Research</th>
                  <th>Student</th>
                  <th>Event</th>
                  <th>Funding</th>
                </tr>
              </thead>
              <tbody>
                ${categoryRows
                  .map((category) => {
                    const counts = Object.fromEntries(
                      analyticsConfig.engagementTypes.map((engagement) => [
                        engagement.key,
                        category.records.filter((record) =>
                          recordMatchesEngagement(record, engagement),
                        ).length,
                      ]),
                    );
                    return `
                      <tr>
                        <th>${escapeHtml(category.label)}</th>
                        <td>${counts["workforce-training"]}</td>
                        <td>${counts["research-rd"]}</td>
                        <td>${counts["student-career"]}</td>
                        <td>${counts["event-convening"]}</td>
                        <td>${counts.funding}</td>
                      </tr>
                    `;
                  })
                  .join("")}
              </tbody>
            </table>
          </div>
        </article>
      </section>
      <section class="analytics-panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Records</p>
            <h2>All responses</h2>
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

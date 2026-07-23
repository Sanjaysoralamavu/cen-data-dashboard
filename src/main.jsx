import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import analyticsConfig from "./data/analytics.json";
import data from "./data/responses.json";
import "./styles.css";
import AnalyticsTracker from "./Analytics.jsx";

const records = data.records;
const byId = new Map(records.map((record) => [record["Response ID"], record]));

function normalizeBasePath(value) {
  const raw = String(value || "/").trim();
  if (raw === "." || raw === "./" || raw === "/") return "/";
  const pathname = new URL(raw, window.location.origin).pathname;
  const trimmed = pathname.replace(/^\/+|\/+$/g, "");
  return trimmed ? `/${trimmed}/` : "/";
}

const appBasePath = normalizeBasePath(import.meta.env.BASE_URL);

function appHref(pathSegment = "") {
  const cleanPath = String(pathSegment).replace(/^\/+/, "");
  return `${appBasePath}${cleanPath}`;
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
    "Mary Lou Fulton College for Teaching and Learning Innovation": "Mary Lou Fulton College for Teaching and Learning Innovation",
    "Office of the Chief Operating Officer": "Office of the COO",
    "Corporate Engagement and Strategic Partnerships (Knowledge Enterprise)": "Knowledge Enterprise",
    "Ira A. Fulton Schools of Engineering - Global Outreach and Extended Education (GOEE)": "Global Outreach and Extended Education",
    "College of Global Futures - Lifelong Learning": "College of Global Futures",
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

function buildAnalytics(sourceRecords) {
  const recordsWithMeta = sourceRecords.map((record) => ({
    record,
    categories: recordCategories(record),
    engagements: recordEngagements(record),
  }));

  const categoryRows = analyticsConfig.categories.map((category) => {
    const categoryRecords = sourceRecords.filter((record) =>
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
    recordsWithMeta
      .filter((item) => item.categories.length)
      .map((item) => item.record["Response ID"]),
  );
  const multiDomainRecords = recordsWithMeta.filter((item) => item.categories.length > 1);
  const engagementRows = analyticsConfig.engagementTypes.map((engagement) => {
    const count = sourceRecords.filter((record) =>
      recordMatchesEngagement(record, engagement),
    ).length;
    return {
      ...engagement,
      count,
      percent: percentage(count, sourceRecords.length),
    };
  });

  return {
    categoryRows,
    engagementRows,
    recordsWithMeta,
    matchedCount: taggedIds.size,
    outsideCount: records.length - taggedIds.size,
    multiDomainRecords,
    maxCategoryCount: Math.max(...categoryRows.map((row) => row.count), 1),
    maxEngagementCount: Math.max(...engagementRows.map((row) => row.count), 1),
  };
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

function normalizePathId() {
  let pathname = decodeURIComponent(window.location.pathname);
  if (appBasePath !== "/") {
    const baseWithoutSlash = appBasePath.replace(/\/$/, "");
    if (pathname === baseWithoutSlash) pathname = "";
    else if (pathname.startsWith(appBasePath)) pathname = pathname.slice(appBasePath.length);
  }
  const id = pathname.replace(/^\/+|\/+$/g, "").trim();
  return id || null;
}

function classificationTone(value) {
  if (value.startsWith("Community Engagement")) return "ce";
  if (value.startsWith("Public Service")) return "ps";
  if (value.startsWith("Not an activity")) return "muted";
  return "neutral";
}

function displayValue(value) {
  return String(value || "Not specified in survey response").trim();
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

function AnswerValue({ value }) {
  const list = splitList(value);
  if (list) {
    return (
      <ul>
        {list.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );
  }

  return <p>{displayValue(value)}</p>;
}

function sourceColumns(question) {
  if (question.fields) return question.fields.map((field) => field.key).join("|");
  if (question.key === "__programsOrInitiatives") {
    return [
      "Activity Name",
      "Activity Description (Short)",
      "ASU Units Involved",
      "Organization Roles",
    ].join("|");
  }
  return question.key;
}

function TemplateQuestion({ question, record }) {
  return (
    <article
      className="template-question"
      data-scrape-field={question.label}
      data-source-column={sourceColumns(question)}
      data-collaboratory-field={question.collaboratoryField || undefined}
    >
      <p className="question-tag">Question</p>
      <h3>{question.label}</h3>
      <div className="answer" data-scrape-answer="true">
        {question.fields ? (
          <div className="answer-stack">
            {question.fields.map((field) => (
              <div
                className="answer-subfield"
                data-source-column={field.key}
                key={field.key}
              >
                <span>{field.label}</span>
                <AnswerValue value={valueForKey(record, field.key)} />
              </div>
            ))}
          </div>
        ) : (
          <AnswerValue value={valueForKey(record, question.key)} />
        )}
      </div>
    </article>
  );
}

function CountBar({ value, max }) {
  const width = max ? `${Math.max(4, Math.round((value / max) * 100))}%` : "0%";
  return (
    <div className="count-bar" aria-hidden="true">
      <span style={{ width }} />
    </div>
  );
}

function KpiCard({ label, value, detail, note, tone = "maroon", children }) {
  return (
    <article className={`kpi-card ${tone}`}>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        {detail && <span>{detail}</span>}
      </div>
      {children && <div className="kpi-visual">{children}</div>}
      {note && <small>{note}</small>}
    </article>
  );
}

function ClassificationMeter({ counts, total }) {
  const ce = percentage(counts.ce, total);
  const ps = percentage(counts.ps, total);
  const other = Math.max(0, 100 - ce - ps);

  return (
    <div className="classification-meter" aria-label="Classification split">
      <div className="classification-track">
        <span className="ce" style={{ width: `${ce}%` }} />
        <span className="ps" style={{ width: `${ps}%` }} />
        {other > 0 && <span className="other" style={{ width: `${other}%` }} />}
      </div>
      <div className="classification-legend">
        <span>{counts.ce} CE</span>
        <span>{counts.ps} PS</span>
        {counts.other > 0 && <span>{counts.other} other</span>}
      </div>
    </div>
  );
}

function RingMetric({ value, total, label }) {
  const percent = percentage(value, total);
  return (
    <div
      className="ring-metric"
      style={{ "--metric-percent": `${percent}%` }}
      aria-label={`${label}: ${percent}%`}
    >
      <strong>{percent}%</strong>
      <span>{label}</span>
    </div>
  );
}

function TrendStrip({ rows }) {
  const max = Math.max(...rows.map((row) => row.count), 1);
  return (
    <div className="trend-strip" aria-hidden="true">
      {rows.map((row) => (
        <span
          key={row.key}
          style={{ height: `${Math.max(18, Math.round((row.count / max) * 68))}px` }}
          title={`${row.label}: ${row.count}`}
        />
      ))}
    </div>
  );
}

function FocusDomainRotator({ rows }) {
  return (
    <div
      className="focus-domain-rotator"
      aria-label={`Top 3 focus domains: ${rows.map((row) => row.label).join(", ")}`}
    >
      <span>Top 3 focus domains</span>
      <div className="focus-domain-slides">
        {rows.map((row, index) => (
          <div
            className="focus-domain-slide"
            key={row.key}
            style={{ "--slide-delay": `${index * 5}s` }}
          >
            <strong>{row.label}</strong>
            <small>
              {row.count} responses / {row.percent}% of total
            </small>
          </div>
        ))}
      </div>
    </div>
  );
}

function RankedMetricChart({ eyebrow, title, rows, total, ariaLabel }) {
  const max = Math.max(...rows.map((row) => row.count), 1);
  return (
    <article className="data-chart-card ranked-chart-card">
      <div className="data-chart-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        <span>{total} responses</span>
      </div>
      <div className="ranked-chart-list" role="list" aria-label={ariaLabel}>
        {rows.map((row) => {
          const width = row.count ? Math.max(6, Math.round((row.count / max) * 100)) : 0;
          return (
            <div
              className="ranked-chart-row"
              key={row.key}
              role="listitem"
              style={{ "--bar-width": `${width}%` }}
              title={`${row.fullLabel || row.label}: ${row.count} responses (${row.percent}%)`}
              aria-label={`${row.fullLabel || row.label}: ${row.count} responses, ${row.percent}%`}
            >
              <div>
                <span>{row.label}</span>
                <strong>{row.count}</strong>
              </div>
              <span className="ranked-chart-track" aria-hidden="true">
                <span />
              </span>
              <small>{row.percent}%</small>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function DomainEngagementSignatureChart({ rows }) {
  return (
    <article className="data-chart-card signature-chart-card">
      <div className="data-chart-heading">
        <div>
          <p className="eyebrow">Domain engagement signature</p>
          <h2>Signal mix by focus domain</h2>
        </div>
        <span>{rows.length} domains</span>
      </div>
      <div className="signature-legend" aria-label="Engagement signal legend">
        {signatureEngagements.map((segment) => (
          <span className={segment.tone} key={segment.key}>
            <i aria-hidden="true" />
            {segment.label}
          </span>
        ))}
      </div>
      <div className="signature-row-list" role="list" aria-label="Engagement signal mix by focus domain">
        {rows.map((row) => (
          <div className="signature-row" key={row.key} role="listitem">
            <div className="signature-row-label">
              <span>{row.label}</span>
              <strong>{row.count}</strong>
            </div>
            <div className="signature-stack" aria-label={`${row.label} engagement signal mix`}>
              {row.segments.map((segment) => (
                <span
                  className={segment.tone}
                  key={segment.key}
                  style={{
                    minWidth: segment.count ? "2px" : 0,
                    width: `${segment.percent}%`,
                  }}
                  title={`${segment.label}: ${segment.count}`}
                  aria-label={`${segment.label}: ${segment.count}`}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function PortfolioChartDeck({ sheets, activeIndex, onSelect }) {
  const safeActiveIndex = sheets[activeIndex] ? activeIndex : 0;

  return (
    <div className="chart-deck" style={{ "--active-chart": safeActiveIndex }}>
      <div className="chart-navigation" role="tablist" aria-label="Portfolio evidence charts">
        {sheets.map((sheet, index) => {
          const active = index === safeActiveIndex;
          return (
            <button
              aria-controls={`portfolio-chart-${sheet.id}`}
              aria-selected={active}
              className={`chart-nav-button ${active ? "active" : ""}`}
              id={`portfolio-chart-tab-${sheet.id}`}
              key={sheet.id}
              onClick={() => onSelect(index)}
              role="tab"
              type="button"
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{sheet.navTitle}</strong>
              <small>{sheet.navDetail}</small>
            </button>
          );
        })}
      </div>
      <div className="chart-stage">
        {sheets.map((sheet, index) => {
          const offset = index - safeActiveIndex;
          const depth = Math.abs(offset);
          const active = index === safeActiveIndex;
          const sheetX = depth ? 18 * depth + 8 * offset : 0;
          return (
            <div
              aria-hidden={!active}
              aria-labelledby={`portfolio-chart-tab-${sheet.id}`}
              className={`chart-sheet ${active ? "active" : ""}`}
              id={`portfolio-chart-${sheet.id}`}
              key={sheet.id}
              role="tabpanel"
              style={{
                "--sheet-depth": depth,
                "--sheet-opacity": Math.max(0.08, 0.32 - depth * 0.1),
                "--sheet-rotate": `${offset * -0.25}deg`,
                "--sheet-scale": Math.max(0.92, 1 - depth * 0.025),
                "--sheet-x": `${sheetX}px`,
                "--sheet-y": `${14 * depth}px`,
              }}
            >
              {sheet.content}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MiniRank({ rows }) {
  return (
    <div className="mini-rank">
      {rows.slice(0, 3).map((row, index) => (
        <span key={row.key}>
          <b>{index + 1}</b>
          {row.label}
        </span>
      ))}
    </div>
  );
}

function TagList({ items, variant = "domain", emptyLabel = "Outside focus domains" }) {
  if (!items.length) return <span className="tag muted">{emptyLabel}</span>;
  return items.map((item) => (
    <span className={`tag ${variant}`} key={item.key}>
      {item.label}
    </span>
  ));
}

function AnalyticsPage() {
  const analytics = useMemo(() => buildAnalytics(records), []);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedEngagement, setSelectedEngagement] = useState("all");
  const [activePortfolioChart, setActivePortfolioChart] = useState(0);
  const selectedCategoryRow = analytics.categoryRows.find(
    (row) => row.key === selectedCategory,
  );
  const selectedEngagementRow = analyticsConfig.engagementTypes.find(
    (row) => row.key === selectedEngagement,
  );
  const classification = classificationSummary(records);
  const topCategory = strongestCategory(analytics.categoryRows);
  const rankedCategories = [...analytics.categoryRows].sort((a, b) => b.count - a.count);
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
  const domainEngagementSignature = domainEngagementSignatureRows(analytics.categoryRows);
  const portfolioChartSheets = [
    {
      id: "sdg",
      navTitle: "SDG alignment",
      navDetail: "Strategic goals",
      content: (
        <RankedMetricChart
          eyebrow="SDG alignment"
          title="Strategic goals"
          rows={sdgAlignment}
          total={records.length}
          ariaLabel="Ranked chart showing SDG alignment across response pages"
        />
      ),
    },
    {
      id: "units",
      navTitle: "Top ASU units",
      navDetail: "Internal contributors",
      content: (
        <RankedMetricChart
          eyebrow="Top ASU units"
          title="Internal contributors"
          rows={topUnits}
          total={records.length}
          ariaLabel="Ranked chart showing top ASU units involved"
        />
      ),
    },
    {
      id: "domain",
      navTitle: "Domain mix",
      navDetail: "Engagement signature",
      content: <DomainEngagementSignatureChart rows={domainEngagementSignature} />,
    },
  ];
  const scopedRecords = records.filter((record) => {
    const matchesCategory =
      !selectedCategoryRow ||
      categoryIdSets.get(selectedCategoryRow.key)?.has(record["Response ID"]);
    const matchesEngagement =
      !selectedEngagementRow || recordMatchesEngagement(record, selectedEngagementRow);
    return matchesCategory && matchesEngagement;
  });
  const scopedRecordIds = new Set(scopedRecords.map((record) => record["Response ID"]));
  const scopedMeta = analytics.recordsWithMeta.filter((item) =>
    scopedRecordIds.has(item.record["Response ID"]),
  );
  const scopedEngagementRows = analyticsConfig.engagementTypes.map((engagement) => {
    const count = scopedRecords.filter((record) =>
      recordMatchesEngagement(record, engagement),
    ).length;
    return {
      ...engagement,
      count,
      percent: percentage(count, scopedRecords.length),
    };
  });
  const maxScopedEngagement = Math.max(
    ...scopedEngagementRows.map((row) => row.count),
    1,
  );
  const activeFilterLabel = [
    selectedCategoryRow?.label || "All focus domains",
    selectedEngagementRow?.label || "all engagement types",
  ].join(" / ");

  return (
    <main className="analytics-main" data-scrape-page="cen-analytics-dashboard">
      <TopNav currentView="analytics" />
      <header className="analytics-hero">
        <div className="analytics-hero-copy">
          <p className="eyebrow">{records.length} validated response pages</p>
          <h1>CEN Analytics Dashboard</h1>
          <p>
            Portfolio view of focus domains, engagement type, student/workforce activity,
            research partnerships, and strategic relationship signals across the cleaned
            survey dataset.
          </p>
        </div>
        <div className="analytics-hero-visual" aria-label="Dashboard signal summary">
          <TrendStrip rows={topFocusDomains} />
          <FocusDomainRotator rows={topFocusDomains} />
        </div>
      </header>

      <section className="kpi-grid" aria-label="Analytics KPI overview">
        <KpiCard
          label="Total responses"
          value={records.length}
          detail="validated survey pages"
          note={`${analytics.matchedCount} in five focus domains`}
          tone="gold"
        />
        <KpiCard
          label="Engagement classification"
          value={`${classification.ce} CE`}
          detail={`${classification.ps} PS${classification.other > 0 ? ` / ${classification.other} other` : ""}`}
          tone="maroon"
        >
          <ClassificationMeter counts={classification} total={records.length} />
        </KpiCard>
        <KpiCard
          label="Top focus category"
          value={topCategory.label}
          detail={`${topCategory.count} responses / ${topCategory.percent}%`}
          tone="maroon"
        />
        <KpiCard
          label="Student / workforce"
          value={studentWorkforceCount}
          detail={`${percentage(studentWorkforceCount, records.length)}% of responses`}
          tone="gold"
        />
        <KpiCard
          label="Research / strategic"
          value={researchStrategicCount}
          detail={`${percentage(researchStrategicCount, records.length)}% of responses`}
          tone="maroon"
        />
      </section>

      <section className="analytics-panel data-charts-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Charts</p>
            <h2>Portfolio evidence</h2>
          </div>
          <span className="panel-count">{records.length} response pages</span>
        </div>
        <PortfolioChartDeck
          activeIndex={activePortfolioChart}
          onSelect={setActivePortfolioChart}
          sheets={portfolioChartSheets}
        />
      </section>

      <section className="analytics-grid focus-grid">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Focus domains</p>
            <h2>Category coverage</h2>
          </div>
          <button
            className={`filter-button reset ${selectedCategory === "all" ? "active" : ""}`}
            type="button"
            onClick={() => setSelectedCategory("all")}
          >
            All domains
          </button>
        </div>
        <div className="category-grid" aria-label="Filter by focus category">
          {rankedCategories.map((category) => (
            <button
              className={`category-card ${selectedCategory === category.key ? "active" : ""}`}
              key={category.key}
              type="button"
              onClick={() => setSelectedCategory(category.key)}
            >
              <span className="category-label">{category.label}</span>
              <strong>{category.count}</strong>
              <CountBar value={category.count} max={analytics.maxCategoryCount} />
              <small>{category.percent}% of all responses</small>
            </button>
          ))}
        </div>
      </section>

      <section className="analytics-panel engagement-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">
              {selectedCategoryRow ? selectedCategoryRow.label : "All responses"}
            </p>
            <h2>Engagement signals</h2>
          </div>
          <span className="panel-count">{scopedRecords.length} records</span>
        </div>
        <div className="engagement-signal-grid" aria-label="Filter by engagement">
          <button
            className={`engagement-signal-card ${selectedEngagement === "all" ? "active" : ""}`}
            type="button"
            onClick={() => setSelectedEngagement("all")}
          >
            <div>
              <span>All engagement types</span>
              <strong>{scopedRecords.length}</strong>
            </div>
            <CountBar value={scopedRecords.length} max={records.length} />
            <small>{percentage(scopedRecords.length, records.length)}% of all responses</small>
          </button>
          {scopedEngagementRows.map((engagement) => (
            <button
              className={`engagement-signal-card ${selectedEngagement === engagement.key ? "active" : ""}`}
              key={engagement.key}
              type="button"
              onClick={() => setSelectedEngagement(engagement.key)}
            >
              <div>
                <span>{engagement.label}</span>
                <strong>{engagement.count}</strong>
              </div>
              <CountBar value={engagement.count} max={maxScopedEngagement} />
              <small>{engagement.percent}% of current records</small>
            </button>
          ))}
        </div>
      </section>

      <section className="analytics-panel record-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Filtered records</p>
            <h2>{activeFilterLabel}</h2>
          </div>
          <span className="panel-count">{scopedMeta.length} shown</span>
        </div>
        <div className="analytics-response-list">
          {scopedMeta.map(({ record, categories, engagements }) => (
            <a
              className="analytics-response-row"
              href={appHref(record["Response ID"])}
              key={record["Response ID"]}
            >
              <span className="response-id">{record["Response ID"]}</span>
              <span className="analytics-response-title">{record["Activity Name"]}</span>
              <span className="tag-stack">
                <TagList items={categories} />
              </span>
              <span className="tag-stack engagement-tags">
                <TagList
                  items={engagements.slice(0, 3)}
                  variant="engagement"
                  emptyLabel="No engagement tag"
                />
              </span>
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}

function TopNav({ currentId, currentView = "response" }) {
  const currentIndex = records.findIndex((record) => record["Response ID"] === currentId);
  const previous = currentIndex > 0 ? records[currentIndex - 1] : null;
  const next = currentIndex >= 0 && currentIndex < records.length - 1 ? records[currentIndex + 1] : null;

  return (
    <nav className="top-nav">
      <a className="brand" href={appHref()}>
        CEN Response Viewer
      </a>
      <div className="nav-actions">
        {currentView !== "index" && <a href={appHref()}>All responses</a>}
        {currentView !== "analytics" && currentView !== "index" && (
          <a href={appHref("analytics")}>Analytics</a>
        )}
        {previous && <a href={appHref(previous["Response ID"])}>Previous</a>}
        {next && <a href={appHref(next["Response ID"])}>Next</a>}
      </div>
    </nav>
  );
}

function ResponsePage({ record }) {
  const classification = displayValue(record["Public Service or Community Engagement"]);
  const tone = classificationTone(classification);

  return (
    <main
      className="response-main"
      data-scrape-page="cen-community-engagement-activity"
      data-response-id={record["Response ID"]}
    >
      <TopNav currentId={record["Response ID"]} />
      <header className="record-header">
        <div>
          <p className="eyebrow">Response {record["Response ID"]}</p>
          <h1 data-scrape-field="Activity Name">{record["Activity Name"]}</h1>
        </div>
        <div
          className={`badge ${tone}`}
          data-scrape-field="Public Service or Community Engagement"
        >
          {classification}
        </div>
      </header>

      {templateSections.map((section) => (
        <section
          className="section-band"
          data-scrape-section={section.title}
          key={section.title}
        >
          <h2>{section.title}</h2>
          <div className="template-list">
            {section.questions.map((question) => (
              <TemplateQuestion
                key={question.label}
                question={question}
                record={record}
              />
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}

function IndexPage() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");

  const visibleRecords = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return records.filter((record) => {
      const classification = displayValue(record["Public Service or Community Engagement"]);
      const matchesFilter =
        filter === "all" ||
        classification.startsWith(filter) ||
        (filter === "Not an activity" && classification.startsWith("Not an activity"));
      if (!matchesFilter) return false;
      if (!needle) return true;
      return [
        record["Response ID"],
        record["Activity Name"],
        record["Activity Description (Short)"],
        record["Community Organizations/Partners Involved"],
        record["ASU Units Involved"],
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [filter, query]);

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

  return (
    <main className="index-main" data-scrape-page="cen-response-index">
      <TopNav currentView="index" />
      <header className="index-header">
        <div>
          <p className="eyebrow">{records.length} response pages</p>
          <h1>CEN Survey Response Pages</h1>
        </div>
        <div className="header-actions">
          <div className="stats">
            <span>{counts.ce} CE</span>
            <span>{counts.ps} PS</span>
            {counts.other > 0 && <span>{counts.other} other</span>}
          </div>
          <a className="primary-button" href={appHref("analytics")}>
            Analytics
          </a>
        </div>
      </header>

      <section className="controls">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search response, activity, partner, unit"
        />
        <select value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="all">All classifications</option>
          <option value="Community Engagement">Community Engagement</option>
          <option value="Public Service">Public Service</option>
          <option value="Not an activity">Not an activity</option>
        </select>
      </section>

      <section className="response-list">
        {visibleRecords.map((record) => {
          const classification = displayValue(record["Public Service or Community Engagement"]);
          return (
            <a
              className="response-row"
              data-response-id={record["Response ID"]}
              href={appHref(record["Response ID"])}
              key={record["Response ID"]}
            >
              <span className="response-id">{record["Response ID"]}</span>
              <span className="response-title">{record["Activity Name"]}</span>
              <span className={`row-pill ${classificationTone(classification)}`}>
                {classification.split(" - ")[0]}
              </span>
            </a>
          );
        })}
      </section>
    </main>
  );
}

function NotFound({ id }) {
  return (
    <main className="response-main">
      <TopNav />
      <section className="not-found">
        <p className="eyebrow">No response found</p>
        <h1>{id}</h1>
        <a href={appHref()}>Back to all responses</a>
      </section>
    </main>
  );
}

function App() {
  const id = normalizePathId();
  return (
    <>
      <AnalyticsTracker id={id} />
      {(() => {
        if (!id) return <IndexPage />;
        if (id === "analytics") return <AnalyticsPage />;
        const record = byId.get(id);
        return record ? <ResponsePage record={record} /> : <NotFound id={id} />;
      })()}
    </>
  );
}

createRoot(document.getElementById("root")).render(<App />);

import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import data from "./data/responses.json";
import "./styles.css";

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

function TopNav({ currentId }) {
  const currentIndex = records.findIndex((record) => record["Response ID"] === currentId);
  const previous = currentIndex > 0 ? records[currentIndex - 1] : null;
  const next = currentIndex >= 0 && currentIndex < records.length - 1 ? records[currentIndex + 1] : null;

  return (
    <nav className="top-nav">
      <a className="brand" href={appHref()}>
        CEN Response Viewer
      </a>
      <div className="nav-actions">
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
      <TopNav />
      <header className="index-header">
        <p className="eyebrow">{records.length} response pages</p>
        <h1>CEN Survey Response Pages</h1>
        <div className="stats">
          <span>{counts.ce} CE</span>
          <span>{counts.ps} PS</span>
          <span>{counts.other} other</span>
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
  if (!id) return <IndexPage />;
  const record = byId.get(id);
  return record ? <ResponsePage record={record} /> : <NotFound id={id} />;
}

createRoot(document.getElementById("root")).render(<App />);
